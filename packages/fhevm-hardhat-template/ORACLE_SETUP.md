# FHEVM BlindEscrow Oracle Setup

## 1. Cấu hình Environment Variables

Tạo file `.env` trong thư mục `packages/fhevm-hardhat-template/`:

```bash
# Deploy contract
INFURA_API_KEY=ac7264316be146b0ae56f2222773a352
PRIVATE_KEY=0x_your_private_key_here
ORACLE_SIGNER=0x_oracle_wallet_address_here

# Relayer server
ORACLE_PK=0x_oracle_private_key_here
RPC_URL=https://sepolia.infura.io/v3/ac7264316be146b0ae56f2222773a352
CONTRACT_ADDRESS=0x_contract_address_after_deploy
PORT=3001

# Frontend
RELAYER_URL=http://localhost:3001
```

## 2. Deploy Contract

```bash
cd packages/fhevm-hardhat-template
npx hardhat run scripts/deploy.ts --network sepolia
```

## 3. Chạy Relayer Server

```bash
# Cài đặt dependencies
npm install express ethers cors nodemon

# Chạy server
node relayer-server.js
```

## 4. Sử dụng Frontend Hooks

```typescript
import { useFinalizeWithOracle, useCreateDeal, useDealStatus } from './frontend-hooks';

// Tạo deal mới
const { dealId } = await useCreateDeal(signer, contractAddress, {
  mode: 0, // P2P
  paymentToken: tokenAddress,
  amount: ethers.parseEther("1.0"),
  encAsk: encryptedAsk,
  encThreshold: encryptedThreshold
});

// Finalize deal thông qua Oracle
const result = await useFinalizeWithOracle(signer, dealId, contractAddress);
```

## 5. Flow hoạt động

1. **Tạo Deal**: Seller tạo deal với encrypted ask/threshold
2. **Place Bid**: Buyer đặt bid (encrypted)
3. **Finalize**: 
   - Frontend gọi `/finalize` endpoint của relayer
   - Relayer tính toán outcome từ ciphertext
   - Relayer ký EIP-191 signature
   - Frontend gọi `finalizeWithOracle()` với signature
   - Contract verify signature và thực hiện transfer

## 6. Lưu ý bảo mật

- Oracle private key phải được bảo mật tuyệt đối
- Relayer server nên chạy trên môi trường an toàn
- Có thể implement multiple oracle signers để tăng tính bảo mật
- Cần implement rate limiting và authentication cho relayer API

## 7. Testing

```bash
# Test relayer health
curl http://localhost:3001/health

# Test finalize endpoint
curl -X POST http://localhost:3001/finalize \
  -H "Content-Type: application/json" \
  -d '{"dealId": 1, "contractAddress": "0x..."}'
```
