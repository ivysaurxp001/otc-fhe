// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * BlindEscrowV2 — Flow gọn (Cách 1: amount là PUBLIC)
 * - ask/bid/threshold giữ kín bằng FHE (euint32). So sánh trên ciphertext -> ebool.
 * - Lộ tối thiểu: chỉ boolean outcome (match/không) bị lộ lúc settle.
 * - Nếu match: chuyển amount (PUBLIC) đã escrow từ buyer sang seller; nếu không: refund buyer.
 *
 * Ghi chú:
 * - Để contract có quyền decrypt boolean outcome, cần gọi FHE.allowThis(...) khi lưu các ciphertext.
 * - Code này dùng FHE.decrypt(ebool) để quyết định đường đi (payout/refund).
 */
contract BlindEscrowV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum DealMode { P2P, OPEN }
    enum DealState { None, Created, A_Submitted, Ready, Settled, Canceled }

    struct Deal {
        DealMode mode;
        DealState state;

        address seller;
        address buyer;           // Với OPEN: sẽ khóa buyer khi bid đầu tiên

        address paymentToken;    // ERC20 dùng thanh toán
        uint256 amount;          // PUBLIC: số tiền thanh toán

        euint32 encAsk;          // ciphertext
        euint32 encThreshold;    // ciphertext
        euint32 encBid;          // ciphertext

        bool success;            // outcome public sau reveal
    }

    uint256 public nextId;
    mapping(uint256 => Deal) public deals;

    event DealCreated(uint256 indexed id, DealMode mode, address indexed seller, address indexed buyerOpt, address token, uint256 amount);
    event SellerSubmitted(uint256 indexed id);
    event BidPlaced(uint256 indexed id, address indexed buyer);
    event Revealed(uint256 indexed id, bool success);
    event Settled(uint256 indexed id, address indexed seller, uint256 amount);
    event Refunded(uint256 indexed id, address indexed buyer, uint256 amount);
    event Canceled(uint256 indexed id);

    // ===== Views (tiện debug) =====
    function version() external pure returns (string memory) { return "BlindEscrowV2:amount-public"; }

    // ===== Core flow =====

    /**
     * @param mode       P2P (buyer phải chỉ định trước) hoặc OPEN (ai bid trước sẽ thành buyer)
     * @param paymentToken ErC20 thanh toán
     * @param amount     Số tiền PUBLIC
     * @param buyerOpt   Bắt buộc khác 0x0 nếu mode=P2P; =0x0 nếu OPEN
     */
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
        d.buyer = buyerOpt; // nếu P2P
        d.paymentToken = paymentToken;
        d.amount = amount;

        emit DealCreated(id, mode, msg.sender, buyerOpt, paymentToken, amount);
    }

    /**
     * Seller gửi ask + threshold (ciphertext). Cấp quyền cho contract dùng để tính outcome.
     */
    function sellerSubmit(uint256 id, euint32 encAsk, euint32 encThreshold) external {
        Deal storage d = deals[id];
        require(d.state == DealState.Created, "bad state");
        require(msg.sender == d.seller, "not seller");

        // Cho phép contract dùng các ciphertext này để tính & decrypt ebool kết quả
        FHE.allowThis(encAsk);
        FHE.allowThis(encThreshold);

        d.encAsk = encAsk;
        d.encThreshold = encThreshold;
        d.state = DealState.A_Submitted;

        emit SellerSubmitted(id);
    }

    /**
     * Buyer đặt bid (ciphertext) và ESCROW amount (PUBLIC) vào contract.
     * Với OPEN: buyer đầu tiên sẽ bị khóa.
     */
    function placeBid(uint256 id, euint32 encBid) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == DealState.A_Submitted, "bad state");
        if (d.mode == DealMode.P2P) {
            require(msg.sender == d.buyer, "buyer fixed");
        } else {
            require(d.buyer == address(0), "buyer locked");
            d.buyer = msg.sender;
        }

        // Contract cần quyền với encBid để tính outcome
        FHE.allowThis(encBid);
        d.encBid = encBid;

        // ESCROW: chuyển amount PUBLIC từ buyer vào contract
        IERC20(d.paymentToken).safeTransferFrom(msg.sender, address(this), d.amount);

        d.state = DealState.Ready;
        emit BidPlaced(id, d.buyer);
    }

    /**
     * So sánh kín bằng FHE -> decrypt ebool outcome -> nếu true: trả seller, nếu false: refund buyer.
     * Ví dụ điều kiện: bid <= ask && ask <= threshold
     */
    function revealAndSettle(uint256 id) external nonReentrant {
        Deal storage d = deals[id];
        require(d.state == DealState.Ready, "bad state");
        require(d.buyer != address(0) && d.seller != address(0), "parties not set");

        // Lấy ciphertext
        euint32 eAsk = d.encAsk;
        euint32 eThr = d.encThreshold;
        euint32 eBid = d.encBid;

        // FHE compare
        ebool ok1 = FHE.le(eBid, eAsk); // bid <= ask
        ebool ok2 = FHE.le(eAsk, eThr); // ask <= threshold
        ebool eSuccess = FHE.and(ok1, ok2);

        // Decrypt boolean outcome (contract được phép vì đã allowThis ở trên)
        bool success = FHE.decrypt(eSuccess);

        d.success = success;
        emit Revealed(id, success);

        if (success) {
            IERC20(d.paymentToken).safeTransfer(d.seller, d.amount);
            d.state = DealState.Settled;
            emit Settled(id, d.seller, d.amount);
        } else {
            IERC20(d.paymentToken).safeTransfer(d.buyer, d.amount);
            d.state = DealState.Canceled;
            emit Refunded(id, d.buyer, d.amount);
        }
    }

    /**
     * Seller hủy trước khi có bid.
     */
    function sellerCancelBeforeBid(uint256 id) external {
        Deal storage d = deals[id];
        require(d.state == DealState.Created || d.state == DealState.A_Submitted, "cannot cancel");
        require(msg.sender == d.seller, "not seller");
        d.state = DealState.Canceled;
        emit Canceled(id);
    }

    // ===== tiện ích / view =====

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

    function getDealState(uint256 id) external view returns (DealState) {
        return deals[id].state;
    }

    // Emergency: rút token lỡ kẹt (onlyOwner)
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
