# BlindEscrowMini Deployment Guide

## 🚀 Quick Start (Local Development)

### 1. Start Hardhat Node & Deploy
```bash
# Option A: Use the automated script (Linux/Mac)
chmod +x scripts/deploy-and-start.sh
./scripts/deploy-and-start.sh

# Option B: Use the automated script (Windows)
scripts/deploy-and-start.bat

# Option C: Manual steps
npx hardhat node --hostname 0.0.0.0
# In another terminal:
npx hardhat run scripts/deployBlindEscrowMiniLocal.ts --network localhost
```

### 2. Update Environment Variables
Create `.env.local` file in your site directory:
```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_NETWORK=localhost
ORACLE_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 3. Start Frontend
```bash
cd packages/site
npm run dev
```

## 🌐 Testnet Deployment (Sepolia)

### 1. Setup Environment
```bash
# Create .env file in hardhat directory
ORACLE_SIGNER_ADDRESS=0xYourOracleSignerAddress
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=0xYourDeployerPrivateKey
```

### 2. Deploy to Sepolia
```bash
npx hardhat run scripts/deployBlindEscrowMiniSepolia.ts --network sepolia
```

### 3. Update Frontend Environment
```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0xDeployedContractAddress
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_NETWORK=sepolia
ORACLE_PRIVATE_KEY=0xYourOraclePrivateKey
```

## 📋 Available Scripts

| Script | Purpose | Network |
|--------|---------|---------|
| `deployBlindEscrowMiniLocal.ts` | Local development | localhost |
| `deployBlindEscrowMiniSepolia.ts` | Testnet deployment | sepolia |
| `deploy-and-start.sh` | Auto start + deploy | localhost |
| `deploy-and-start.bat` | Auto start + deploy (Windows) | localhost |

## 🔧 Contract Configuration

### Constructor Parameters
- `initialOwner`: Contract owner address (usually deployer)
- `oracleSigner`: Address that can sign oracle outcomes

### Key Functions
- `createDeal(buyer, amount)`: Create P2P deal
- `sellerSubmit(id, encAsk)`: Submit encrypted ask price
- `placeBid(id, encBid)`: Place encrypted bid + escrow ETH
- `computeOutcome(id)`: Compute FHE comparison
- `finalizeWithOracle(id, outcome, sig)`: Finalize with oracle signature

## 🧪 Testing the Contract

### 1. Create Deal
```typescript
const tx = await contract.createDeal(buyerAddress, ethers.parseEther("0.1"));
```

### 2. Seller Submit (with FHEVM)
```typescript
const enc = await fhevm.createEncryptedInput(contractAddress, sellerAddress);
enc.add32(askPrice);
const res = await enc.encrypt("sellerSubmit(uint256,euint32)");
const handle = ethers.hexlify(res.handles[0]);
await contract.sellerSubmit(dealId, handle);
```

### 3. Buyer Place Bid (with FHEVM)
```typescript
const encB = await fhevm.createEncryptedInput(contractAddress, buyerAddress);
encB.add32(bidPrice);
const resB = await encB.encrypt("placeBid(uint256,euint32)");
const handleB = ethers.hexlify(resB.handles[0]);
await contract.placeBid(dealId, handleB, { value: amount });
```

## 🐛 Troubleshooting

### Common Issues

1. **"FHEVM instance not available"**
   - Check if FHEVM is properly initialized
   - Verify network connection

2. **"Cannot read properties of undefined"**
   - Make sure contract is deployed
   - Check contract address in environment

3. **"Invalid signature"**
   - Verify function signature in `encrypt()`
   - Check if using correct contract ABI

4. **"Deal state error"**
   - Follow the correct flow: Create → Seller Submit → Place Bid → Compute → Finalize
   - Check deal state with `getDealPublic()`

### Debug Commands
```bash
# Check hardhat node status
curl http://localhost:8545

# Check contract deployment
npx hardhat run scripts/deployBlindEscrowMiniLocal.ts --network localhost

# Verify contract functions
npx hardhat console --network localhost
```

## 📚 Next Steps

1. **Deploy contract** using one of the scripts above
2. **Update environment variables** with the deployed contract address
3. **Start frontend** and test with `BlindEscrowMiniDemo` component
4. **Test the full flow**: Create Deal → Seller Submit → Place Bid → Compute → Finalize

## 🔗 Useful Links

- [FHEVM Documentation](https://docs.zama.ai/fhevm)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Ethers.js v6 Documentation](https://docs.ethers.org/v6/)
- [Sepolia Faucet](https://sepoliafaucet.com/)
