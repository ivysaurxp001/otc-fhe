import type { NextApiRequest, NextApiResponse } from "next";
import { Wallet, AbiCoder, keccak256, getBytes, hashMessage } from "ethers";

type Body = {
  contract: string;       // address contract BlindEscrowV2_Oracle
  chainId: number;        // 11155111 (Sepolia)
  dealId: number;         // id deal
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { contract, chainId, dealId } = req.body as Body;
    if (!contract || !chainId || dealId === undefined) {
      return res.status(400).json({ error: "Bad params" });
    }

    // 1) Tạo wallet oracle (server-side only)
    const ORACLE_PK = process.env.ORACLE_PK!;
    if (!ORACLE_PK) return res.status(500).json({ error: "Missing ORACLE_PK" });
    const wallet = new Wallet(ORACLE_PK);

    // 2) Tạo Relayer client (tham số tùy bản SDK: relayer URL, rpc, chainId, ...)
    const RELAYER_URL = process.env.RELAYER_URL!;
    const RPC_URL = process.env.RPC_URL!;

    // TODO: Import và sử dụng RelayerClient thật từ @zama-fhe/relayer-sdk
    // const relayer = new RelayerClient({
    //   relayerUrl: RELAYER_URL,
    //   rpcUrl: RPC_URL,
    //   chainId: chainId,
    //   wallet,
    // });

    // 3) YÊU CẦU GIẢI MÃ encOutcome (user-decryption) CHO oracleSigner
    //    Hiện tại dùng random để test, thay thế bằng:
    //    const outcome: boolean = await relayer.decryptBoolean({
    //      contractAddress: contract,
    //      dealId,
    //      key: "encOutcome"
    //    });
    
    // Placeholder: random outcome để test
    const outcome: boolean = Math.random() > 0.5;

    // 4) Ký outcome (EIP-191) để contract xác minh
    const abi = new AbiCoder();
    const inner = keccak256(abi.encode(
      ["address","uint256","uint256","bool"],
      [contract, chainId, dealId, outcome]
    ));
    const digest = hashMessage(getBytes(inner)); // = keccak256("\x19Ethereum Signed Message:\n32" || inner)
    const signature = await wallet.signMessage(getBytes(inner));

    res.status(200).json({
      outcome,
      signature,
      oracle: await wallet.getAddress(),
      digest
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "internal error" });
  }
}
