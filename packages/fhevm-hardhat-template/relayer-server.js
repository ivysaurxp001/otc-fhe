require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Cấu hình
const ORACLE_PK = process.env.ORACLE_PK; // Private key của oracle signer
const RPC_URL = process.env.RPC_URL || 'https://sepolia.infura.io/v3/your_infura_key';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // Địa chỉ contract sau khi deploy

if (!ORACLE_PK) {
  console.error('ORACLE_PK environment variable is required');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const oracleWallet = new ethers.Wallet(ORACLE_PK, provider);

// ABI cần thiết cho contract
const CONTRACT_ABI = [
  "function deals(uint256) view returns (uint8, uint8, address, address, address, uint256, bytes, bytes, bytes, bool)",
  "function chainId() view returns (uint256)"
];

let contract;

// Khởi tạo contract
async function initContract() {
  if (CONTRACT_ADDRESS) {
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    console.log('Contract initialized at:', CONTRACT_ADDRESS);
  } else {
    console.log('CONTRACT_ADDRESS not set, will use from request');
  }
}

// Tính toán outcome từ ciphertext (placeholder - cần implement với FHEVM SDK)
async function computeOutcome(dealId, contractAddress) {
  try {
    // TODO: Implement với FHEVM SDK để decrypt và so sánh
    // Hiện tại return random để test
    const random = Math.random();
    return random > 0.5;
  } catch (error) {
    console.error('Error computing outcome:', error);
    throw error;
  }
}

// Tạo EIP-191 signature
async function createSignature(contractAddress, chainId, dealId, success) {
  // Tạo message hash theo EIP-191
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'uint256', 'bool'],
    [contractAddress, chainId, dealId, success]
  );
  
  const ethSignedMessageHash = ethers.hashMessage(ethers.getBytes(messageHash));
  const signature = await oracleWallet.signMessage(ethers.getBytes(messageHash));
  
  return signature;
}

// API endpoint để finalize deal
app.post('/finalize', async (req, res) => {
  try {
    const { dealId, contractAddress } = req.body;
    
    if (!dealId || !contractAddress) {
      return res.status(400).json({ error: 'dealId and contractAddress are required' });
    }

    // Lấy chainId
    const chainId = await provider.getNetwork().then(n => n.chainId);
    
    // Tính toán outcome
    const success = await computeOutcome(dealId, contractAddress);
    
    // Tạo signature
    const signature = await createSignature(contractAddress, chainId, dealId, success);
    
    res.json({
      success,
      signature,
      dealId,
      contractAddress,
      chainId: chainId.toString()
    });
    
  } catch (error) {
    console.error('Error in /finalize:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', oracleAddress: oracleWallet.address });
});

const PORT = process.env.PORT || 3001;

async function start() {
  await initContract();
  
  app.listen(PORT, () => {
    console.log(`Relayer server running on port ${PORT}`);
    console.log(`Oracle address: ${oracleWallet.address}`);
  });
}

start().catch(console.error);
