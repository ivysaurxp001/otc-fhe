import { ethers } from "ethers";

// Contract ABI (updated to match new contract)
const CONTRACT_ABI = [
  "function createDeal(uint8 mode, address paymentToken, uint256 amount, address buyerOpt) external returns (uint256)",
  "function sellerSubmit(uint256 id, bytes calldata encAsk, bytes calldata encThreshold) external",
  "function placeBid(uint256 id, bytes calldata encBid) external",
  "function computeOutcome(uint256 id) external",
  "function finalizeWithOracle(uint256 id, bool outcome, bytes calldata signature) external",
  "function getDealPublic(uint256 id) view returns (uint8 mode, uint8 state, address seller, address buyer, address token, uint256 amount, bool success)",
  "function deals(uint256) view returns (uint8, uint8, address, address, address, uint256, bytes, bytes, bytes, bytes, bool)",
  "event DealCreated(uint256 indexed id, uint8 mode, address indexed seller, address indexed buyerOpt, address token, uint256 amount)",
  "event SellerSubmitted(uint256 indexed id)",
  "event BidPlaced(uint256 indexed id, address indexed buyer)",
  "event OutcomeComputed(uint256 indexed id)",
  "event Finalized(uint256 indexed id, bool success)"
];

export class BlindEscrowFlow {
  private contract: ethers.Contract;
  private signer: ethers.Signer;

  constructor(contractAddress: string, signer: ethers.Signer) {
    this.contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);
    this.signer = signer;
  }

  /**
   * Bước 1: Tạo Deal
   */
  async createDeal(params: {
    mode: number; // 0 = P2P, 1 = OPEN
    buyer?: string; // Optional cho P2P mode
    paymentToken: string;
    amount: string;
  }) {
    const tx = await this.contract.createDeal(
      params.mode,
      params.paymentToken,
      params.amount,
      params.buyer || ethers.ZeroAddress
    );

    const receipt = await tx.wait();
    
    // Parse event để lấy dealId
    const event = receipt.logs.find(log => {
      try {
        const parsed = this.contract.interface.parseLog(log);
        return parsed.name === 'DealCreated';
      } catch {
        return false;
      }
    });

    if (!event) throw new Error('DealCreated event not found');
    
    const parsed = this.contract.interface.parseLog(event);
    const dealId = parsed.args.id;

    return { dealId, txHash: tx.hash, receipt };
  }

  /**
   * Bước 2: Seller Submit (encrypt ask, threshold)
   */
  async sellerSubmit(dealId: number, encAsk: string, encThreshold: string) {
    const tx = await this.contract.sellerSubmit(dealId, encAsk, encThreshold);
    const receipt = await tx.wait();
    
    return { txHash: tx.hash, receipt };
  }

  /**
   * Bước 3: Place Bid (encrypt bid + approve/escrow)
   */
  async placeBid(dealId: number, encBid: string) {
    const tx = await this.contract.placeBid(dealId, encBid);
    const receipt = await tx.wait();
    
    return { txHash: tx.hash, receipt };
  }

  /**
   * Bước 4: Compute Outcome (FHE on-chain)
   */
  async computeOutcome(dealId: number) {
    const tx = await this.contract.computeOutcome(dealId);
    const receipt = await tx.wait();
    
    return { txHash: tx.hash, receipt };
  }

  /**
   * Bước 5: Finalize (gọi serverless API + finalizeWithOracle)
   */
  async finalizeDeal(dealId: number, chainId: number) {
    // 1) Gọi API serverless để decrypt + ký
    const response = await fetch("/api/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contract: await this.contract.getAddress(), 
        chainId, 
        dealId 
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const { outcome, signature } = await response.json();

    // 2) Gọi contract.finalizeWithOracle(...)
    const tx = await this.contract.finalizeWithOracle(dealId, outcome, signature);
    const receipt = await tx.wait();
    
    return { outcome, signature, txHash: tx.hash, receipt };
  }

  /**
   * Lấy thông tin deal (public data only)
   */
  async getDealPublic(dealId: number) {
    const deal = await this.contract.getDealPublic(dealId);
    return {
      mode: deal[0],
      state: deal[1],
      seller: deal[2],
      buyer: deal[3],
      paymentToken: deal[4],
      amount: deal[5],
      success: deal[6]
    };
  }

  /**
   * Lấy thông tin deal đầy đủ (bao gồm encrypted data)
   */
  async getDeal(dealId: number) {
    const deal = await this.contract.deals(dealId);
    return {
      mode: deal[0],
      state: deal[1],
      seller: deal[2],
      buyer: deal[3],
      paymentToken: deal[4],
      amount: deal[5],
      encAsk: deal[6],
      encThreshold: deal[7],
      encBid: deal[8],
      encOutcome: deal[9],
      success: deal[10]
    };
  }

  /**
   * Complete flow (5 bước)
   */
  async completeFlow(params: {
    mode: number;
    buyer?: string;
    paymentToken: string;
    amount: string;
    encAsk: string;
    encThreshold: string;
    encBid: string;
    chainId: number;
  }) {
    console.log("🚀 Starting complete BlindEscrow flow...");

    // Bước 1: Create Deal
    console.log("📝 Step 1: Creating deal...");
    const { dealId } = await this.createDeal({
      mode: params.mode,
      buyer: params.buyer,
      paymentToken: params.paymentToken,
      amount: params.amount
    });
    console.log(`✅ Deal created with ID: ${dealId}`);

    // Bước 2: Seller Submit
    console.log("👤 Step 2: Seller submitting...");
    await this.sellerSubmit(dealId, params.encAsk, params.encThreshold);
    console.log("✅ Seller submitted");

    // Bước 3: Place Bid
    console.log("💰 Step 3: Placing bid...");
    await this.placeBid(dealId, params.encBid);
    console.log("✅ Bid placed");

    // Bước 4: Compute Outcome
    console.log("🧮 Step 4: Computing outcome...");
    await this.computeOutcome(dealId);
    console.log("✅ Outcome computed");

    // Bước 5: Finalize
    console.log("🎯 Step 5: Finalizing...");
    const result = await this.finalizeDeal(dealId, params.chainId);
    console.log(`✅ Finalized with outcome: ${result.outcome}`);

    return {
      dealId,
      outcome: result.outcome,
      signature: result.signature,
      txHash: result.txHash
    };
  }
}

// Helper function để tạo dummy encrypted data (cho testing)
export function createDummyEncryptedData(): { encAsk: string; encThreshold: string; encBid: string } {
  return {
    encAsk: "0x" + "0".repeat(64),
    encThreshold: "0x" + "0".repeat(64),
    encBid: "0x" + "0".repeat(64)
  };
}

// Usage example:
export async function exampleUsage(provider: ethers.BrowserProvider, contractAddress: string) {
  const signer = await provider.getSigner();
  const flow = new BlindEscrowFlow(contractAddress, signer);
  
  const dummyData = createDummyEncryptedData();
  
  const result = await flow.completeFlow({
    mode: 0, // P2P
    paymentToken: ethers.ZeroAddress, // ETH
    amount: ethers.parseEther("1.0"),
    encAsk: dummyData.encAsk,
    encThreshold: dummyData.encThreshold,
    encBid: dummyData.encBid,
    chainId: 11155111 // Sepolia
  });
  
  console.log("Flow completed:", result);
}
