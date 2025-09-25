// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * BlindEscrowV2_Oracle — amount PUBLIC + FHE outcome (encrypted)
 * - ask/bid/threshold: euint32 (ciphertext)
 * - on-chain compute: ebool encOutcome = (bid <= ask) && (ask <= threshold)  (vẫn kín)
 * - oracleSigner được cấp quyền user-decrypt encOutcome để lấy plaintext boolean
 * - oracle ký outcome và gửi vào finalizeWithOracle(...) => chuyển tiền theo amount public
 */
contract BlindEscrowV2_Oracle is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum DealMode { P2P, OPEN }
    enum DealState { None, Created, A_Submitted, Ready, OutcomeComputed, Settled, Canceled }

    struct Deal {
        DealMode mode;
        DealState state;

        address seller;
        address buyer;

        address paymentToken;
        uint256 amount;        // PUBLIC

        euint32 encAsk;
        euint32 encThreshold;
        euint32 encBid;

        ebool   encOutcome;    // encrypted boolean outcome (computed on-chain)
        bool    success;       // plaintext outcome set on finalize
    }

    uint256 public nextId;
    mapping(uint256 => Deal) public deals;

    /// Address dùng để ký outcome (serverless oracle)
    address public oracleSigner;

    event DealCreated(uint256 indexed id, DealMode mode, address indexed seller, address indexed buyerOpt, address token, uint256 amount);
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

    function version() external pure returns (string memory) { return "BlindEscrowV2_Oracle+EncOutcome"; }

    // ----- Core flow -----

    function createDeal(
        DealMode mode,
        address paymentToken,
        uint256 amount,
        address buyerOpt
    ) external returns (uint256 id) {
        require(paymentToken != address(0), "paymentToken=0");
        require(amount > 0, "amount=0");
        if (mode == DealMode.P2P) {
            require(buyerOpt != address(0), "buyer required in P2P");
        } else {
            require(buyerOpt == address(0), "buyerOpt must be zero in OPEN");
        }

        id = ++nextId;
        Deal storage d = deals[id];
        d.mode = mode;
        d.state = DealState.Created;
        d.seller = msg.sender;
        d.buyer = buyerOpt;
        d.paymentToken = paymentToken;
        d.amount = amount;

        emit DealCreated(id, mode, msg.sender, buyerOpt, paymentToken, amount);
    }

    function sellerSubmit(uint256 id, euint32 encAsk, euint32 encThreshold) external {
        Deal storage d = deals[id];
        require(d.state == DealState.Created, "bad state");
        require(msg.sender == d.seller, "not seller");

        FHE.allowThis(encAsk);
        FHE.allowThis(encThreshold);

        d.encAsk = encAsk;
        d.encThreshold = encThreshold;
        d.state = DealState.A_Submitted;

        emit SellerSubmitted(id);
    }

    function placeBid(uint256 id, euint32 encBid) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == DealState.A_Submitted, "bad state A");
        if (d.mode == DealMode.P2P) {
            require(msg.sender == d.buyer, "buyer fixed");
        } else {
            require(d.buyer == address(0), "buyer locked");
            d.buyer = msg.sender;
        }

        FHE.allowThis(encBid);
        d.encBid = encBid;

        // ESCROW amount PUBLIC vào contract
        IERC20(d.paymentToken).safeTransferFrom(msg.sender, address(this), d.amount);

        d.state = DealState.Ready;
        emit BidPlaced(id, d.buyer);
    }

    /// Tính outcome (encrypted) trên chuỗi và CẤP QUYỀN user-decrypt cho oracleSigner
    function computeOutcome(uint256 id) external {
        Deal storage d = deals[id];
        require(d.state == DealState.Ready, "bad state R");

        // ebool = (bid <= ask) && (ask <= threshold)
        ebool ok1 = FHE.le(d.encBid, d.encAsk);
        ebool ok2 = FHE.le(d.encAsk, d.encThreshold);
        ebool eSuccess = FHE.and(ok1, ok2);

        // Lưu encOutcome để oracle có thể yêu cầu decrypt qua SDK
        d.encOutcome = eSuccess;

        // Cấp quyền user-decrypt cho oracleSigner (chỉ outcome, không lộ inputs)
        FHE.allow(eSuccess, oracleSigner);

        d.state = DealState.OutcomeComputed;
        emit OutcomeComputed(id);
    }

    /// Oracle ký outcome plaintext (obtained via user-decrypt) và gửi vào đây để finalize & chuyển tiền
    function finalizeWithOracle(
        uint256 id,
        bool outcome,
        bytes calldata signature
    ) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == DealState.OutcomeComputed, "bad state OC");
        require(d.seller != address(0) && d.buyer != address(0), "parties not set");

        // Verify signature
        bytes32 digest = _finalizeDigest(address(this), block.chainid, id, outcome);
        address rec = _recover(digest, signature);
        require(rec == oracleSigner, "bad oracle sig");

        d.success = outcome;
        emit Finalized(id, outcome);

        if (outcome) {
            IERC20(d.paymentToken).safeTransfer(d.seller, d.amount);
            d.state = DealState.Settled;
            emit Settled(id, d.seller, d.amount);
        } else {
            IERC20(d.paymentToken).safeTransfer(d.buyer, d.amount);
            d.state = DealState.Canceled;
            emit Refunded(id, d.buyer, d.amount);
        }
    }

    function sellerCancelBeforeBid(uint256 id) external {
        Deal storage d = deals[id];
        require(d.state == DealState.Created || d.state == DealState.A_Submitted, "cannot cancel");
        require(msg.sender == d.seller, "not seller");
        d.state = DealState.Canceled;
        emit Canceled(id);
    }

    // ----- Views -----

    function getDealPublic(
        uint256 id
    )
        external
        view
        returns (DealMode mode, DealState state, address seller, address buyer, address token, uint256 amount, bool success)
    {
        Deal storage d = deals[id];
        require(d.state != DealState.None, "deal not found");
        return (d.mode, d.state, d.seller, d.buyer, d.paymentToken, d.amount, d.success);
    }

    // ----- Admin / Utils -----
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    // EIP-191 light signing
    function _finalizeDigest(address _this, uint256 _chainId, uint256 _dealId, bool _outcome) internal pure returns (bytes32) {
        bytes32 inner = keccak256(abi.encode(_this, _chainId, _dealId, _outcome));
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
