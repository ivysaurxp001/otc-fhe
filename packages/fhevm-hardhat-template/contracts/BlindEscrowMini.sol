// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ⚠️ Với @fhevm/solidity@0.8.0 import thế này
import "@fhevm/solidity/lib/FHE.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * BlindEscrowMini — phiên bản tối thiểu:
 * - Chỉ P2P, dùng ETH
 * - FHE: seller gửi encAsk (euint32), buyer gửi encBid (euint32)
 * - On-chain: ebool encOutcome = (bid ≤ ask)
 * - Oracle được allow user-decrypt encOutcome -> ký -> finalize
 */
contract BlindEscrowMini is Ownable, ReentrancyGuard {
    enum State { None, Created, Ready, OutcomeComputed, Settled, Canceled }

    struct Deal {
        address seller;
        address buyer;     // chỉ định trước
        uint256 amount;    // công khai (ETH)

        euint32 encAsk;
        euint32 encBid;

        ebool   encOutcome; // kết quả mã hóa
        bool    success;    // plaintext do oracle set
        State   state;
    }

    uint256 public nextId;
    mapping(uint256 => Deal) public deals;

    address public oracleSigner;

    event DealCreated(uint256 indexed id, address indexed seller, address indexed buyer, uint256 amount);
    event SellerSubmitted(uint256 indexed id);
    event BidPlaced(uint256 indexed id, address indexed buyer);
    event OutcomeComputed(uint256 indexed id);
    event Finalized(uint256 indexed id, bool success);
    event Settled(uint256 indexed id, address indexed seller, uint256 amount);
    event Refunded(uint256 indexed id, address indexed buyer, uint256 amount);
    event Canceled(uint256 indexed id);

    constructor(address initialOwner, address _oracleSigner) Ownable(initialOwner) {
        require(_oracleSigner != address(0), "oracle=0");
        oracleSigner = _oracleSigner;
    }

    function setOracleSigner(address s) external onlyOwner {
        require(s != address(0), "oracle=0");
        oracleSigner = s;
    }

    function version() external pure returns (string memory) { return "BlindEscrowMini+FHE"; }

    // -------- Core flow (tối thiểu) --------

    function createDeal(address buyer, uint256 amount) external returns (uint256 id) {
        require(buyer != address(0), "buyer=0");
        require(amount > 0, "amount=0");

        id = ++nextId;
        Deal storage d = deals[id];
        d.seller = msg.sender;
        d.buyer = buyer;
        d.amount = amount;
        d.state = State.Created;

        emit DealCreated(id, d.seller, d.buyer, amount);
    }

    // Seller gửi ask (FHE) — chữ ký: sellerSubmit(uint256,externalEuint32,bytes)
    function sellerSubmit(uint256 id, externalEuint32 extAsk, bytes calldata attestation) external {
        Deal storage d = deals[id];
        require(d.state == State.Created, "bad state");
        require(msg.sender == d.seller, "not seller");

        // Chuyển external -> encrypted handle + verify attestation
        euint32 encAsk = FHE.fromExternal(extAsk, attestation);
        require(FHE.isSenderAllowed(encAsk), "NOT_ALLOWED");

        d.encAsk = encAsk;
        FHE.allow(d.encAsk, address(this)); // để dùng tiếp ở các tx sau
        d.state = State.Ready; // sẵn sàng cho buyer bid + deposit
        emit SellerSubmitted(id);
    }

    // Buyer đặt bid (FHE) kèm tiền (ETH) — chữ ký: placeBid(uint256,externalEuint32,bytes)
    function placeBid(uint256 id, externalEuint32 extBid, bytes calldata attestation) external payable nonReentrant {
        Deal storage d = deals[id];
        require(d.state == State.Ready, "bad state");
        require(msg.sender == d.buyer, "not buyer");
        require(msg.value == d.amount, "bad ETH");

        // Chuyển external -> encrypted handle + verify attestation
        euint32 encBid = FHE.fromExternal(extBid, attestation);
        require(FHE.isSenderAllowed(encBid), "NOT_ALLOWED");

        d.encBid = encBid;
        FHE.allow(d.encBid, address(this)); // để dùng tiếp ở các tx sau
        emit BidPlaced(id, msg.sender);
    }

    // Tính kết quả bí mật và allow oracle giải mã — chữ ký: computeOutcome(uint256)
    function computeOutcome(uint256 id) external {
        Deal storage d = deals[id];
        require(d.state == State.Ready, "bad state");

        // ebool = (bid ≤ ask)
        ebool eok = FHE.le(d.encBid, d.encAsk);
        d.encOutcome = eok;

        // Cấp quyền giải mã outcome cho oracle signer
        FHE.allow(eok, oracleSigner);

        d.state = State.OutcomeComputed;
        emit OutcomeComputed(id);
    }

    // Oracle gửi plaintext outcome + chữ ký
    function finalizeWithOracle(uint256 id, bool outcome, bytes calldata sig) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == State.OutcomeComputed, "bad state");
        require(d.seller != address(0) && d.buyer != address(0), "parties");

        bytes32 digest = _finalizeDigest(address(this), block.chainid, id, outcome);
        address rec = _recover(digest, sig);
        require(rec == oracleSigner, "bad sig");

        d.success = outcome;
        emit Finalized(id, outcome);

        if (outcome) {
            // thành công -> trả seller
            (bool ok, ) = d.seller.call{value: d.amount}("");
            require(ok, "pay seller");
            d.state = State.Settled;
            emit Settled(id, d.seller, d.amount);
        } else {
            // fail -> refund buyer
            (bool ok, ) = d.buyer.call{value: d.amount}("");
            require(ok, "refund buyer");
            d.state = State.Canceled;
            emit Refunded(id, d.buyer, d.amount);
        }
    }

    // -------- Views --------
    function getDealPublic(uint256 id)
        external view
        returns (address seller, address buyer, uint256 amount, bool success, State state)
    {
        Deal storage d = deals[id];
        require(d.state != State.None, "not found");
        return (d.seller, d.buyer, d.amount, d.success, d.state);
    }

    // -------- Utils (EIP-191) --------
    function _finalizeDigest(address _this, uint256 _chainId, uint256 _dealId, bool _ok) internal pure returns (bytes32) {
        bytes32 inner = keccak256(abi.encode(_this, _chainId, _dealId, _ok));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "sig len");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "bad v");
        return ecrecover(digest, v, r, s);
    }
}
