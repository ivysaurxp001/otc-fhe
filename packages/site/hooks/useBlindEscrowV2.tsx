import { useCallback, useState, useEffect } from "react";
import { ethers, Interface } from "ethers";
import { BlindEscrowV2ABI } from "../abi/BlindEscrowV2ABI";
import { useFhevm } from "@fhevm/react";
import { useMetaMaskEthersSigner } from "./metamask/useMetaMaskEthersSigner";
// Removed RelayerClient import - not available in client-side

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
  
  // Use MetaMask signer for FHEVM
  const {
    provider,
    chainId,
    initialMockChains,
  } = useMetaMaskEthersSigner();
  
  const { instance, status, error } = useFhevm({
    provider,
    chainId,
    initialMockChains,
    enabled: true,
  });
  
  // FHEVM readiness state
  const isFhevmReady = !!instance && status === 'ready';

  const getSigner = useCallback(async () => {
    if (!provider) {
      throw new Error("Provider not available");
    }
    const ethersProvider = new ethers.BrowserProvider(provider);
    return await ethersProvider.getSigner();
  }, [provider]);

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
      const dealIdNum = BigInt(dealId);                      // ✅ đảm bảo là BigInt
      const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
      const sellerSigner = await getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        BlindEscrowV2ABI,
        sellerSigner
      );
      const sellerAddr = await sellerSigner.getAddress();

      console.log("SellerSubmit parameters:", {
        dealId: dealIdNum.toString(),
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
        const dealInfo = await contract.getDealPublic(dealIdNum);
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
        if (dealInfo[2].toLowerCase() !== sellerAddr.toLowerCase()) {
          throw new Error(`Caller ${sellerAddr} is not the seller ${dealInfo[2]}`);
        }
      } catch (error) {
        console.error("Deal validation error:", error);
        throw error;
      }

      // ✅ Sử dụng FHEVM instance (client-side pattern)
      if (!instance) {
        throw new Error(`FHEVM instance not available. Status: ${status}, Provider: ${!!provider}, ChainId: ${chainId}`);
      }

      // ✅ Kiểm tra selector để chắc chữ ký đúng
      const iface = new Interface([
        "function sellerSubmit(uint256 id, euint32 encAsk, euint32 encThreshold)"
      ]);
      console.log("[CHK] selector", iface.getFunction("sellerSubmit")!.selector); // 0x9c135429

      // ✅ TẠO HANDLE BẰNG FHEVM instance với đúng pattern
      const enc = await instance.createEncryptedInput(contractAddress, sellerAddr);
      enc.add32(ask);        // euint32 #1
      enc.add32(threshold);  // euint32 #2
      
      const encResult = await enc.encrypt();
      
      const encAskHandle = `0x${Buffer.from(encResult.handles[0]).toString('hex')}`;
      const encThrHandle = `0x${Buffer.from(encResult.handles[1]).toString('hex')}`;

      console.log("[CHK] handles len", encAskHandle.length, encThrHandle.length); // ~66,66

      // ✅ GỌI BẰNG sellerSigner (đúng vai trò)
      // (Optional) Thử static trước: nếu pass thì send tx
      await (contract as any).connect(sellerSigner).callStatic.sellerSubmit(
        dealIdNum,
        encAskHandle,
        encThrHandle
      );

      const tx = await (contract as any).connect(sellerSigner).sellerSubmit(
        dealIdNum,
        encAskHandle,
        encThrHandle
      );
      await tx.wait();
    } catch (error: any) {
      console.error("SellerSubmit error:", error);
      throw error;
    } finally { 
      setBusy(false); 
    }
  }, [getSigner, instance, status, provider, chainId]);

  const placeBid = useCallback(async (
    dealId: bigint, 
    bid: number, 
    paymentToken: string, 
    amount: string
  ) => {
    setBusy(true);
    try {
      const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
      const buyerSigner = await getSigner();
      const buyerAddr = await buyerSigner.getAddress();
      
      // ERC20 ABI for approve and allowance
      const erc20Abi = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)"
      ];
      
      const erc20 = new ethers.Contract(paymentToken, erc20Abi, buyerSigner);
      
      // Check and approve if needed
      const allowance = await erc20.allowance(buyerAddr, contractAddress);
      if (allowance < BigInt(amount)) {
        const txApprove = await erc20.approve(contractAddress, amount);
        await txApprove.wait();
      }

      // BlindEscrow contract
      const contract = new ethers.Contract(
        contractAddress,
        BlindEscrowV2ABI,
        buyerSigner
      );

      // ✅ Sử dụng FHEVM instance (client-side pattern)
      if (!instance) {
        throw new Error(`FHEVM instance not available. Status: ${status}, Provider: ${!!provider}, ChainId: ${chainId}`);
      }

      // ✅ TẠO HANDLE BẰNG FHEVM instance cho bid
      const encB = await instance.createEncryptedInput(contractAddress, buyerAddr);
      encB.add32(bid); // euint32
      const encResult = await encB.encrypt();
      const encBidHandle = `0x${Buffer.from(encResult.handles[0]).toString('hex')}`;
      
      console.log("[CHK] bid handle len:", encBidHandle.length); // ~66

      await (contract as any).connect(buyerSigner).placeBid(BigInt(dealId), encBidHandle);
    } finally { 
      setBusy(false); 
    }
  }, [getSigner, instance, status, provider, chainId]);

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
    isFhevmReady,
    fhevmStatus: status,
    fhevmError: error,
    createDeal, 
    sellerSubmit, 
    placeBid, 
    computeOutcome,
    finalizeWithOracle,
    getDealInfo,
    sellerCancelBeforeBid
  };
}
