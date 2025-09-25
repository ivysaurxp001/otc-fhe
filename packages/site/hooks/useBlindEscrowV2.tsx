import { useCallback, useState } from "react";
import { ethers } from "ethers";
import { BlindEscrowV2ABI } from "../abi/BlindEscrowV2ABI";
//import { RelayerClient } from "@zama-fhe/relayer-sdk";

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
  
  const getSigner = useCallback(async () => {
    if (!(window as any).ethereum) {
      throw new Error("MetaMask not installed");
    }
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    return await provider.getSigner();
  }, []);

  // Real FHEVM Relayer client
  const getRelayerClient = useCallback(async () => {
    const signer = await getSigner();
    return new RelayerClient({
      relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL!,
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID),
      wallet: signer
    });
  }, [getSigner]);

  // Validation function for ciphertext
  const looksLikeCiphertext = (x: string) => {
    // ciphertext thường dài > 200 hex chars
    return typeof x === "string" && x.startsWith("0x") && x.length > 200;
  };

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
        BlindEscrowV2ABI,
        signer
      );
      
      console.log("Contract address:", contractAddress);
      console.log("Signer address:", await signer.getAddress());
      
      // Check network
      const network = await signer.provider.getNetwork();
      console.log("Network:", {
        name: network.name,
        chainId: network.chainId.toString()
      });
      
      // Check contract code
      const code = await signer.provider.getCode(contractAddress);
      console.log("Contract code length:", code.length);
      if (code === "0x") {
        throw new Error("No contract found at address. Please check contract deployment.");
      }
      
      console.log("Parameters:", { 
        mode, 
        modeType: typeof mode,
        token, 
        amount, 
        buyerOpt: buyerOpt ?? ethers.ZeroAddress 
      });
      console.log("Raw parameters for contract call:", [mode, token, amount, buyerOpt ?? ethers.ZeroAddress]);
      
      const tx = await contract.createDeal(
        mode, 
        token, 
        amount, 
        buyerOpt ?? ethers.ZeroAddress
      );
      return await tx.wait();
    } catch (error: any) {
      console.error("CreateDeal error:", error);
      throw error;
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
        BlindEscrowV2ABI,
        signer
      );

      console.log("SellerSubmit parameters:", {
        dealId: dealId.toString(),
        ask,
        threshold
      });

      // Check contract first
      try {
        const version = await contract.version();
        console.log("Contract version:", version);
      } catch (versionError) {
        console.error("Contract version check failed:", versionError);
        throw new Error("Contract not accessible. Please check contract address and network.");
      }

      // Check deal state first
      try {
        const dealInfo = await contract.getDealPublic(dealId);
        console.log("Deal info before submit:", {
          mode: dealInfo[0].toString(),
          state: dealInfo[1].toString(),
          stateType: typeof dealInfo[1],
          stateNumber: Number(dealInfo[1]),
          seller: dealInfo[2],
          buyer: dealInfo[3],
          token: dealInfo[4],
          amount: dealInfo[5].toString(),
          success: dealInfo[6]
        });
        
        // Check if deal is in correct state (1 = Created)
        const dealState = Number(dealInfo[1]);
        if (dealState !== 1) {
          throw new Error(`Deal is in wrong state: ${dealState}. Expected state 1 (Created)`);
        }
        
        // Check if caller is the seller
        const signerAddress = await signer.getAddress();
        if (dealInfo[2].toLowerCase() !== signerAddress.toLowerCase()) {
          throw new Error(`Caller ${signerAddress} is not the seller ${dealInfo[2]}`);
        }
      } catch (error) {
        console.error("Deal validation error:", error);
        throw error;
      }

      // Encrypt values using real FHEVM Relayer
      const relayer = await getRelayerClient();
      const encAsk = await relayer.encryptU32(ask);
      const encThreshold = await relayer.encryptU32(threshold);
      
      console.log("Encrypted values:", {
        encAsk,
        encThreshold,
        lenAsk: encAsk?.length,
        lenThr: encThreshold?.length,
      });

      // Validate ciphertexts
      if (!looksLikeCiphertext(encAsk) || !looksLikeCiphertext(encThreshold)) {
        throw new Error("Encryption failed: not a valid FHE ciphertext");
      }
      
      // Try static call first to see the exact error
      try {
        await contract.sellerSubmit.staticCall(dealId, encAsk, encThreshold);
        console.log("Static call successful, proceeding with transaction...");
      } catch (staticError) {
        console.error("Static call failed:", staticError);
        throw staticError;
      }
      
      const tx = await contract.sellerSubmit(dealId, encAsk, encThreshold);
      return await tx.wait();
    } catch (error: any) {
      console.error("SellerSubmit error:", error);
      throw error;
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner, getRelayerClient]);

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
        BlindEscrowV2ABI,
        signer
      );
      
      // Encrypt bid using real FHEVM Relayer
      const relayer = await getRelayerClient();
      const encBid = await relayer.encryptU32(bid);
      
      console.log("Encrypted bid:", {
        encBid,
        lenBid: encBid?.length,
      });

      // Validate ciphertext
      if (!looksLikeCiphertext(encBid)) {
        throw new Error("Encryption failed: not a valid FHE ciphertext");
      }
      
      const tx = await contract.placeBid(dealId, encBid);
      return await tx.wait();
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner, getRelayerClient]);

  const computeOutcome = useCallback(async (dealId: bigint) => {
    setBusy(true);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        BlindEscrowV2ABI,
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
        BlindEscrowV2ABI,
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
      BlindEscrowV2ABI,
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
        BlindEscrowV2ABI,
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
