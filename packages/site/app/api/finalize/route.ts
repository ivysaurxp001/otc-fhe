export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { Wallet, AbiCoder, keccak256, getBytes } from "ethers";
import { RelayerClient } from "@zama-fhe/relayer-sdk";

export async function POST(req: NextRequest) {
  try {
    const { contract, chainId, dealId } = await req.json();
    
    if (!contract || !chainId || dealId === undefined) {
      return new Response(JSON.stringify({ error: "Bad params" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { ORACLE_PK, RELAYER_URL, RPC_URL } = process.env as Record<string,string>;
    
    if (!ORACLE_PK || !RELAYER_URL || !RPC_URL) {
      return new Response(JSON.stringify({ error: "Missing environment variables" }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    console.log("Oracle processing:", { contract, chainId, dealId });

    const wallet = new Wallet(ORACLE_PK);
    const relayer = new RelayerClient({ 
      relayerUrl: RELAYER_URL, 
      rpcUrl: RPC_URL, 
      chainId, 
      wallet 
    });

    // Decrypt encOutcome (đã allow cho oracleSigner bởi computeOutcome)
    const outcome: boolean = await relayer.decryptBoolean({ 
      contractAddress: contract, 
      dealId, 
      key: "encOutcome" 
    });

    console.log("Decrypted outcome:", outcome);

    // Ký outcome (EIP-191)
    const abi = new AbiCoder();
    const inner = keccak256(abi.encode(
      ["address","uint256","uint256","bool"], 
      [contract, chainId, dealId, outcome]
    ));
    const signature = await wallet.signMessage(getBytes(inner));

    console.log("Oracle signature generated");

    return new Response(JSON.stringify({ outcome, signature }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Oracle error:", error);
    return new Response(JSON.stringify({ 
      error: "Oracle processing failed", 
      details: error.message 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}