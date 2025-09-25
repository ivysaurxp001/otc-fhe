import { ethers } from 'ethers';

// Cấu hình
const RELAYER_URL = process.env.RELAYER_URL || 'http://localhost:3001';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

// ABI cho finalizeWithOracle function
const FINALIZE_ABI = [
  "function finalizeWithOracle(uint256 dealId, bool success, bytes calldata signature) external"
];

interface FinalizeResponse {
  success: boolean;
  signature: string;
  dealId: number;
  contractAddress: string;
  chainId: string;
}

/**
 * Hook để finalize deal thông qua Oracle/Relayer
 */
export async function useFinalizeWithOracle(
  signer: ethers.Signer,
  dealId: number,
  contractAddress?: string
) {
  try {
    // Gọi relayer để tính toán outcome và lấy signature
    const response = await fetch(`${RELAYER_URL}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealId,
        contractAddress: contractAddress || CONTRACT_ADDRESS
      })
    });

    if (!response.ok) {
      throw new Error(`Relayer error: ${response.statusText}`);
    }

    const data: FinalizeResponse = await response.json();
    
    // Tạo contract instance
    const contract = new ethers.Contract(
      data.contractAddress,
      FINALIZE_ABI,
      signer
    );

    // Gọi finalizeWithOracle
    const tx = await contract.finalizeWithOracle(
      data.dealId,
      data.success,
      data.signature
    );

    console.log('Transaction submitted:', tx.hash);
    
    // Đợi transaction được confirm
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt);

    return {
      success: data.success,
      txHash: tx.hash,
      receipt
    };

  } catch (error) {
    console.error('Error in finalizeWithOracle:', error);
    throw error;
  }
}

/**
 * Hook để kiểm tra trạng thái deal
 */
export async function useDealStatus(
  provider: ethers.Provider,
  dealId: number,
  contractAddress: string
) {
  try {
    const DEAL_ABI = [
      "function deals(uint256) view returns (uint8, uint8, address, address, address, uint256, bytes, bytes, bytes, bool)"
    ];

    const contract = new ethers.Contract(contractAddress, DEAL_ABI, provider);
    const deal = await contract.deals(dealId);
    
    return {
      mode: deal[0],
      state: deal[1],
      seller: deal[2],
      buyer: deal[3],
      paymentToken: deal[4],
      amount: deal[5],
      success: deal[9]
    };
  } catch (error) {
    console.error('Error getting deal status:', error);
    throw error;
  }
}

/**
 * Hook để tạo deal mới
 */
export async function useCreateDeal(
  signer: ethers.Signer,
  contractAddress: string,
  dealParams: {
    mode: number; // 0 = P2P, 1 = OPEN
    buyer?: string; // Optional cho P2P mode
    paymentToken: string;
    amount: string;
    encAsk: string; // Encrypted ask price
    encThreshold: string; // Encrypted threshold
  }
) {
  try {
    const CREATE_DEAL_ABI = [
      "function createDeal(uint8 mode, address buyerOpt, address paymentToken, uint256 amount, bytes calldata encAsk, bytes calldata encThreshold) external returns (uint256)"
    ];

    const contract = new ethers.Contract(contractAddress, CREATE_DEAL_ABI, signer);
    
    const tx = await contract.createDeal(
      dealParams.mode,
      dealParams.buyer || ethers.ZeroAddress,
      dealParams.paymentToken,
      dealParams.amount,
      dealParams.encAsk,
      dealParams.encThreshold
    );

    const receipt = await tx.wait();
    
    // Lấy dealId từ event (cần parse event logs)
    const dealId = receipt.logs[0]?.args?.id || 0;
    
    return {
      dealId,
      txHash: tx.hash,
      receipt
    };
  } catch (error) {
    console.error('Error creating deal:', error);
    throw error;
  }
}
