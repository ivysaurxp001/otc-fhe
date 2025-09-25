import { NextRequest } from "next/server";
import { Wallet, AbiCoder, keccak256, getBytes, hashMessage } from "ethers";

// Force Node.js runtime for ethers.js compatibility
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { contract, chainId, dealId } = await req.json();
    
    if (!contract || !chainId || dealId === undefined) {
      return new Response(JSON.stringify({ error: "Bad params" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { ORACLE_PK, RELAYER_URL, RPC_URL } = process.env as Record<string, string>;
    
    if (!ORACLE_PK || !RELAYER_URL || !RPC_URL) {
      return new Response(JSON.stringify({ error: "Missing environment variables" }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const wallet = new Wallet(ORACLE_PK);
    
    // TODO: Replace with real FHEVM Relayer SDK when available
    // For now, simulate oracle logic with placeholder
    console.log(`Oracle processing deal ${dealId} on contract ${contract}`);
    
    // Simulate FHE decryption result (replace with real SDK call)
    // const relayer = new RelayerClient({ relayerUrl: RELAYER_URL, rpcUrl: RPC_URL, chainId, wallet });
    // const outcome: boolean = await relayer.decryptBoolean({
    //   contractAddress: contract,
    //   dealId,
    //   key: "encOutcome"
    // });
    
    // Placeholder: simulate successful deal outcome
    const outcome = true;
    
    // Sign outcome using EIP-191
    const abi = new AbiCoder();
    const inner = keccak256(abi.encode(
      ["address", "uint256", "uint256", "bool"], 
      [contract, chainId, dealId, outcome]
    ));
    const signature = await wallet.signMessage(getBytes(inner));
    
    return new Response(JSON.stringify({ 
      outcome, 
      signature,
      digest: inner,
      oracle: await wallet.getAddress()
    }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("Oracle API error:", error);
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
