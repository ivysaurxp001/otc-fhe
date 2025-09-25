import { useCallback, useState } from "react";
import { ethers } from "ethers";

type Mode = 0 | 1; // 0=P2P, 1=OPEN

interface DealInfo {
  mode: Mode;
  state: number;
  seller: string;
  buyer: string;
  token: string;
  amount: string;
  success: boolean;
}

export function useBlindEscrowV2(contractAddress: string) {
  const [busy, setBusy] = useState(false);
  
  // Mock FHEVM instance for demo
  const instance = {
    encrypt32: async (value: number) => {
      // Mock encryption - in real app, this would use FHEVM SDK
      return `0x${value.toString(16).padStart(64, '0')}`;
    }
  };

  const getSigner = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask not installed");
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    return await provider.getSigner();
  }, []);

  const createDeal = useCallback(async (
    mode: Mode, 
    token: string, 
    amount: string, 
    buyerOpt?: string
  ) => {
    setBusy(true);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        contractAddress, 
        [
          "function createDeal(uint8 mode, address paymentToken, uint256 amount, address buyerOpt) external returns (uint256)",
          "event DealCreated(uint256 indexed id, uint8 mode, address indexed seller, address indexed buyerOpt, address token, uint256 amount)"
        ], 
        signer
      );
      
      const tx = await contract.createDeal(
        mode, 
        token, 
        amount, 
        buyerOpt ?? ethers.ZeroAddress
      );
      return await tx.wait();
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner]);

  const sellerSubmit = useCallback(async (
    dealId: bigint, 
    ask: number, 
    threshold: number
  ) => {
    setBusy(true);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        [
          "function sellerSubmit(uint256 id, bytes calldata encAsk, bytes calldata encThreshold) external",
          "event SellerSubmitted(uint256 indexed id)"
        ],
        signer
      );

      // Encrypt values using fhevm
      const encAsk = await instance.encrypt32(ask);
      const encThreshold = await instance.encrypt32(threshold);
      
      const tx = await contract.sellerSubmit(dealId, encAsk, encThreshold);
      return await tx.wait();
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner, instance]);

  const placeBid = useCallback(async (
    dealId: bigint, 
    bid: number, 
    paymentToken: string, 
    amount: string
  ) => {
    setBusy(true);
    try {
      const signer = await getSigner();
      const userAddress = await signer.getAddress();
      
      // ERC20 ABI for approve and allowance
      const erc20Abi = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)"
      ];
      
      const erc20 = new ethers.Contract(paymentToken, erc20Abi, signer);
      
      // Check and approve if needed
      const allowance = await erc20.allowance(userAddress, contractAddress);
      if (allowance < BigInt(amount)) {
        const txApprove = await erc20.approve(contractAddress, amount);
        await txApprove.wait();
      }

      // BlindEscrow contract
      const contract = new ethers.Contract(
        contractAddress,
        [
          "function placeBid(uint256 id, bytes calldata encBid) external",
          "event BidPlaced(uint256 indexed id, address indexed buyer)"
        ],
        signer
      );
      
      const encBid = await instance.encrypt32(bid);
      const tx = await contract.placeBid(dealId, encBid);
      return await tx.wait();
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner, instance]);

  const computeOutcome = useCallback(async (dealId: bigint) => {
    setBusy(true);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        [
          "function computeOutcome(uint256 id) external",
          "event OutcomeComputed(uint256 indexed id)"
        ],
        signer
      );
      
      const tx = await contract.computeOutcome(dealId);
      return await tx.wait();
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner]);

  const finalizeWithOracle = useCallback(async (dealId: bigint) => {
    setBusy(true);
    try {
      // Call Next.js API route for oracle signature
      const response = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract: contractAddress,
          chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID),
          dealId: dealId.toString()
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Oracle request failed');
      }
      
      const { outcome, signature } = await response.json();
      
      const signer = await getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        [
          "function finalizeWithOracle(uint256 id, bool outcome, bytes calldata signature) external",
          "event Finalized(uint256 indexed id, bool success)"
        ],
        signer
      );
      
      const tx = await contract.finalizeWithOracle(dealId, outcome, signature);
      return await tx.wait();
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner]);

  const getDealInfo = useCallback(async (dealId: bigint): Promise<DealInfo> => {
    const signer = await getSigner();
    const contract = new ethers.Contract(
      contractAddress,
      [
        "function getDealPublic(uint256 id) external view returns (uint8 mode, uint8 state, address seller, address buyer, address token, uint256 amount, bool success)"
      ],
      signer
    );
    
    const [mode, state, seller, buyer, token, amount, success] = await contract.getDealPublic(dealId);
    return { mode, state, seller, buyer, token, amount: amount.toString(), success };
  }, [contractAddress, getSigner]);

  const sellerCancelBeforeBid = useCallback(async (dealId: bigint) => {
    setBusy(true);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        [
          "function sellerCancelBeforeBid(uint256 id) external",
          "event Canceled(uint256 indexed id)"
        ],
        signer
      );
      
      const tx = await contract.sellerCancelBeforeBid(dealId);
      return await tx.wait();
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner]);

  return { 
    busy, 
    createDeal, 
    sellerSubmit, 
    placeBid, 
    computeOutcome,
    finalizeWithOracle,
    getDealInfo,
    sellerCancelBeforeBid
  };
}
