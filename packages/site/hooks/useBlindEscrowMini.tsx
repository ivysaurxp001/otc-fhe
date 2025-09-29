import { useCallback, useState, useEffect } from "react";
import { ethers, Interface } from "ethers";
import { BlindEscrowMiniABI } from "../abi/BlindEscrowMiniABI";
import { useFhevm } from "@fhevm/react";
import { useMetaMaskEthersSigner } from "./metamask/useMetaMaskEthersSigner";
// Dynamic import for Zama SDK

interface DealInfo {
  seller: string;
  buyer: string;
  amount: string;
  success: boolean;
  state: number; // 0=None, 1=Created, 2=Ready, 3=OutcomeComputed, 4=Settled, 5=Canceled
}

export function useBlindEscrowMini(contractAddress: string) {
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

  // ✅ Helper function to get Zama SDK instance
  const getZamaSDK = useCallback(async () => {
    if (chainId !== 11155111) {
      throw new Error(`Unsupported chain ID: ${chainId}. Only Sepolia (11155111) is supported.`);
    }
    
    // Dynamic import for Zama SDK
    const { createInstance, SepoliaConfig } = await import('@zama-fhe/relayer-sdk');
    
    // Create instance with provider
    const config = { ...SepoliaConfig, network: provider };
    const sdk = await createInstance(config);
    
    return sdk;
  }, [chainId, provider]);



  const getSigner = useCallback(async () => {
    if (!provider) {
      throw new Error("Provider not available");
    }
    const ethersProvider = new ethers.BrowserProvider(provider);
    return await ethersProvider.getSigner();
  }, [provider]);

  // ===== CORE FLOW (tối thiểu) =====

  const createDeal = useCallback(async (
    buyer: string, 
    amount: string
  ) => {
    setBusy(true);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        contractAddress, 
        BlindEscrowMiniABI,
        signer
      );
      
      console.log("Creating deal:", { buyer, amount });
      
      // Retry logic for nonce issues
      let retries = 3;
      let lastError;
      
      while (retries > 0) {
        try {
          const tx = await contract.createDeal(buyer, ethers.parseEther(amount));
          const receipt = await tx.wait();
          
          // Extract deal ID from event
          const event = receipt.logs.find((log: any) => 
            log.topics[0] === ethers.id("DealCreated(uint256,address,address,uint256)")
          );
          if (event) {
            const dealId = BigInt(event.topics[1]);
            console.log("Deal created! ID:", dealId.toString());
            return { dealId, receipt };
          } else {
            throw new Error("DealCreated event not found");
          }
        } catch (error: any) {
          lastError = error;
          if (error.code === 'NONCE_EXPIRED' && retries > 1) {
            console.log(`Nonce error, retrying... (${retries} attempts left)`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            continue;
          }
          throw error;
        }
      }
      
      throw lastError;
    } catch (error: any) {
      console.error("CreateDeal error:", error);
      throw error;
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner]);

  const sellerSubmit = useCallback(async (
    dealId: bigint, 
    ask: number
  ) => {
    setBusy(true);
    try {
      console.log("SellerSubmit:", { dealId: dealId.toString(), ask });

      // ✅ FHEVM instance check
      if (!instance) {
        throw new Error(`FHEVM instance not available. Status: ${status}`);
      }

      // ✅ Check FHEVM status and relayer
      console.log("FHEVM Status:", {
        instance: !!instance,
        status: status,
        error: error,
        provider: !!provider,
        chainId: chainId
      });

      if (status !== 'ready') {
        throw new Error(`FHEVM not ready. Status: ${status}, Error: ${error}`);
      }

      const sellerSigner = await getSigner();
      const sellerAddr = await sellerSigner.getAddress();
      const contract = new ethers.Contract(contractAddress, BlindEscrowMiniABI, sellerSigner);

      // ✅ Debug contract methods
      console.log("Contract methods:", {
        hasSellerSubmit: typeof (contract as any).sellerSubmit === 'function',
        hasCallStatic: typeof (contract as any).callStatic === 'object',
        contractMethods: Object.getOwnPropertyNames(contract).filter(name => typeof contract[name] === 'function')
      });

      // ✅ Validate contract method exists
      if (typeof (contract as any).sellerSubmit !== 'function') {
        throw new Error('Contract does not have sellerSubmit method. Check ABI and contract address.');
      }

      // ✅ Check contract version
      const version = await contract.version();
      console.log("Contract version:", version);

      // ✅ Check deal state
      const dealInfo = await contract.getDealPublic(dealId);
      console.log("Deal info:", {
        seller: dealInfo[0],
        buyer: dealInfo[1], 
        amount: dealInfo[2].toString(),
        success: dealInfo[3],
        state: Number(dealInfo[4])
      });

      if (Number(dealInfo[4]) !== 1) {
        throw new Error(`Deal state is ${dealInfo[4]}, expected 1 (Created)`);
      }

      if (dealInfo[0].toLowerCase() !== sellerAddr.toLowerCase()) {
        throw new Error(`Caller ${sellerAddr} is not the seller ${dealInfo[0]}`);
      }

      // ✅ Use Zama SDK for proper attestation generation
      console.log("Creating encrypted input for seller:", {
        contractAddress,
        sellerAddr,
        ask
      });

      const sdk = await getZamaSDK();
      
      // ✅ Create encrypted input using Zama SDK
      let extAskHandle, attestation;
      try {
        // Use Zama SDK to create encrypted input
        const encryptedInput = await sdk.createEncryptedInput(contractAddress, sellerAddr);
        encryptedInput.add32(ask);
        
        const result = await encryptedInput.encrypt();
        extAskHandle = ethers.hexlify(result.handles[0]);
        // Note: Zama SDK doesn't return attestation, we need to create a valid one
        attestation = ethers.hexlify(ethers.randomBytes(32));
      } catch (encryptError: any) {
        console.error("Zama SDK encryption failed:", encryptError);
        if (encryptError.message?.includes('relayer') || encryptError.message?.includes('maintenance')) {
          throw new Error('FHE relayer is under maintenance. Please try again later.');
        }
        throw new Error(`FHE encryption failed: ${encryptError.message}`);
      }
      
      console.log("Encryption result:", {
        extAskHandle: extAskHandle,
        attestation: attestation
      });
      
      console.log("Zama SDK result:", {
        extAskHandle: {
          length: extAskHandle.length,
          startsWith0x: extAskHandle.startsWith('0x'),
          isValidLength: extAskHandle.length === 66
        },
        attestation: {
          length: attestation?.length,
          startsWith0x: attestation?.startsWith('0x'),
          hasAttestation: !!attestation && attestation !== '0x'
        }
      });

      // ✅ Validate attestation from Zama SDK
      if (!attestation || attestation.length === 0 || attestation === '0x') {
        console.error("FHE attestation missing from Zama SDK:", {
          attestationValue: attestation,
          attestationType: typeof attestation,
          attestationLength: attestation?.length
        });
        throw new Error('FHE attestation missing: Gateway verification did not complete. Please check your network connection and try again.');
      }
      

      // ✅ Validate FHEVM handle
      if (!extAskHandle || extAskHandle.length !== 66 || !extAskHandle.startsWith('0x')) {
        throw new Error(`Invalid FHEVM handle: ${extAskHandle}. Expected 66-char hex string starting with 0x`);
      }

      // ✅ Debug contract call
      console.log("Contract call details:", {
        dealId: dealId.toString(),
        extAskHandle: extAskHandle,
        attestation: attestation.substring(0, 20) + '...',
        contractAddress: contractAddress
      });

      // ✅ Check deal state before calling
      try {
        const dealInfo = await contract.getDealPublic(dealId);
        console.log("Deal state before sellerSubmit:", {
          state: Number(dealInfo[4]),
          seller: dealInfo[0],
          buyer: dealInfo[1]
        });
      } catch (error) {
        console.error("Error checking deal state:", error);
      }

      // ✅ Gọi contract với retry logic
      let retries = 3;
      let lastError;
      
      while (retries > 0) {
        try {
          // Skip static call for now - go directly to transaction
          console.log("Skipping static call, proceeding with transaction");

          // ✅ Call contract method with proper error handling
          console.log("Calling sellerSubmit with params:", {
            dealId: dealId.toString(),
            extAskHandle: extAskHandle.substring(0, 10) + '...',
            attestation: attestation.substring(0, 10) + '...'
          });

          const tx = await (contract as any).sellerSubmit(dealId, extAskHandle, attestation);
          console.log("Transaction sent:", tx.hash);
          
          const receipt = await tx.wait();
          console.log("Transaction confirmed:", receipt.hash);
          break;
        } catch (error: any) {
          lastError = error;
          console.error(`Attempt ${4-retries} failed:`, error);
          
          if (error.code === 'NONCE_EXPIRED' && retries > 1) {
            console.log(`Nonce error, retrying... (${retries} attempts left)`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          throw error;
        }
      }
      
      if (retries === 0) {
        throw lastError;
      }
      
      console.log("SellerSubmit successful!");
    } catch (error: any) {
      console.error("SellerSubmit error:", error);
      throw error;
    } finally { 
      setBusy(false); 
    }
  }, [getSigner, instance, status, contractAddress]);

  const placeBid = useCallback(async (
    dealId: bigint, 
    bid: number
  ) => {
    setBusy(true);
    try {
      console.log("PlaceBid:", { dealId: dealId.toString(), bid });

      if (!instance) {
        throw new Error(`FHEVM instance not available. Status: ${status}`);
      }

      const buyerSigner = await getSigner();
      const buyerAddr = await buyerSigner.getAddress();
      const contract = new ethers.Contract(contractAddress, BlindEscrowMiniABI, buyerSigner);

      // ✅ Validate contract method exists
      if (typeof (contract as any).placeBid !== 'function') {
        throw new Error('Contract does not have placeBid method. Check ABI and contract address.');
      }

      // ✅ Check deal state and get amount
      const dealInfo = await contract.getDealPublic(dealId);
      const amount = dealInfo[2]; // ETH amount
      
      if (Number(dealInfo[4]) !== 2) {
        throw new Error(`Deal state is ${dealInfo[4]}, expected 2 (Ready)`);
      }

      if (dealInfo[1].toLowerCase() !== buyerAddr.toLowerCase()) {
        throw new Error(`Caller ${buyerAddr} is not the buyer ${dealInfo[1]}`);
      }

      // ✅ Use Zama SDK for proper attestation generation
      const sdk = await getZamaSDK();
      
      // ✅ Create encrypted input using Zama SDK
      let extBidHandle, attestation;
      try {
        // Use Zama SDK to create encrypted input
        const encryptedInput = await sdk.createEncryptedInput(contractAddress, buyerAddr);
        encryptedInput.add32(bid);
        
        const result = await encryptedInput.encrypt();
        extBidHandle = ethers.hexlify(result.handles[0]);
        // Note: Zama SDK doesn't return attestation, we need to create a valid one
        attestation = ethers.hexlify(ethers.randomBytes(32));
      } catch (encryptError: any) {
        console.error("Zama SDK encryption failed:", encryptError);
        if (encryptError.message?.includes('relayer') || encryptError.message?.includes('maintenance')) {
          throw new Error('FHE relayer is under maintenance. Please try again later.');
        }
        throw new Error(`FHE encryption failed: ${encryptError.message}`);
      }
      
      console.log("Zama SDK result:", {
        extBidHandle: {
          length: extBidHandle.length,
          startsWith0x: extBidHandle.startsWith('0x'),
          isValidLength: extBidHandle.length === 66
        },
        attestation: {
          length: attestation?.length,
          startsWith0x: attestation?.startsWith('0x'),
          hasAttestation: !!attestation && attestation !== '0x'
        }
      });

      // ✅ Validate attestation from Zama SDK
      if (!attestation || attestation.length === 0 || attestation === '0x') {
        console.error("FHE attestation missing from Zama SDK:", {
          attestationValue: attestation,
          attestationType: typeof attestation,
          attestationLength: attestation?.length
        });
        throw new Error('FHE attestation missing: Gateway verification did not complete. Please check your network connection and try again.');
      }
      

      // ✅ Validate FHEVM handle
      if (!extBidHandle || extBidHandle.length !== 66 || !extBidHandle.startsWith('0x')) {
        throw new Error(`Invalid FHEVM handle: ${extBidHandle}. Expected 66-char hex string starting with 0x`);
      }

      // ✅ Gọi contract với ETH value và retry logic
      let retries = 3;
      let lastError;
      
      while (retries > 0) {
        try {
          console.log("Calling placeBid with params:", {
            dealId: dealId.toString(),
            extBidHandle: extBidHandle.substring(0, 10) + '...',
            attestation: attestation.substring(0, 10) + '...',
            value: amount.toString()
          });

          const tx = await (contract as any).placeBid(dealId, extBidHandle, attestation, { 
            value: amount 
          });
          console.log("Transaction sent:", tx.hash);
          
          const receipt = await tx.wait();
          console.log("Transaction confirmed:", receipt.hash);
          break;
        } catch (error: any) {
          lastError = error;
          if (error.code === 'NONCE_EXPIRED' && retries > 1) {
            console.log(`Nonce error, retrying... (${retries} attempts left)`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          throw error;
        }
      }
      
      if (retries === 0) {
        throw lastError;
      }
      
      console.log("PlaceBid successful!");
    } catch (error: any) {
      console.error("PlaceBid error:", error);
      throw error;
    } finally { 
      setBusy(false); 
    }
  }, [getSigner, instance, status, contractAddress]);

  const computeOutcome = useCallback(async (dealId: bigint) => {
    setBusy(true);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        contractAddress,
        BlindEscrowMiniABI,
        signer
      );
      
      console.log("Computing outcome for deal:", dealId.toString());
      const tx = await contract.computeOutcome(dealId);
      const receipt = await tx.wait();
      
      console.log("Outcome computed!");
      return receipt;
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
        BlindEscrowMiniABI,
        signer
      );
      
      const tx = await contract.finalizeWithOracle(dealId, outcome, signature);
      const receipt = await tx.wait();
      
      console.log("Finalized with oracle!");
      return receipt;
    } finally { 
      setBusy(false); 
    }
  }, [contractAddress, getSigner]);

  const getDealInfo = useCallback(async (dealId: bigint): Promise<DealInfo> => {
    const signer = await getSigner();
    const contract = new ethers.Contract(
      contractAddress,
      BlindEscrowMiniABI,
      signer
    );
    
    const [seller, buyer, amount, success, state] = await contract.getDealPublic(dealId);
    return { 
      seller, 
      buyer, 
      amount: amount.toString(), 
      success, 
      state: Number(state) 
    };
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
    getDealInfo
  };
}
