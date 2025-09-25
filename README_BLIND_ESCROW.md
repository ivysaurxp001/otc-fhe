# Blind Escrow V2 - FHE Demo

Dự án Blind Escrow sử dụng Fully Homomorphic Encryption (FHE) trên Zama fhEVM để thực hiện giao dịch mù với logic định giá được giữ bí mật.

## 🎯 Tính năng chính

- **Giao dịch mù**: Ask, bid, và threshold được mã hóa bằng FHE
- **Logic bí mật**: So sánh giá trị trên ciphertext, chỉ lộ kết quả boolean
- **Flow đơn giản**: 4 bước wizard interface
- **Bảo mật**: Sử dụng FHE.allowThis() và FHE.decrypt() để kiểm soát quyền truy cập

## 🏗️ Kiến trúc

### Smart Contract (BlindEscrowV2.sol)
- Sử dụng `euint32` cho các giá trị mã hóa
- FHE operations: `FHE.le()`, `FHE.and()`, `FHE.decrypt()`
- Logic: `bid <= ask && ask <= threshold`
- Settlement dựa trên amount public

### Frontend (React/Next.js)
- Hook `useBlindEscrowV2` để tương tác với contract
- UI wizard 4 bước với progress indicator
- Tích hợp fhevm-react để encrypt/decrypt

## 📋 Luồng giao dịch

1. **Create Deal**: Tạo deal P2P hoặc OPEN với amount public
2. **Seller Submit**: Gửi ask và threshold đã mã hóa
3. **Place Bid**: Buyer đặt bid mã hóa và escrow amount
4. **Reveal & Settle**: FHE so sánh và settle theo kết quả

## 🚀 Cài đặt và chạy

### 1. Deploy Contract

```bash
cd packages/fhevm-hardhat-template

# Deploy BlindEscrowV2
npx hardhat run deploy/deployBlindEscrowV2.ts --network localhost

# Copy contract address to .env
echo "NEXT_PUBLIC_CONTRACT_ADDRESS=0x..." >> packages/site/.env.local
```

### 2. Chạy Frontend

```bash
cd packages/site
npm install
npm run dev
```

### 3. Test Contract

```bash
cd packages/fhevm-hardhat-template

# Tạo deal mới
npx hardhat blind-escrow:create --mode 0 --token 0x... --amount 100 --buyer 0x...

# Xem thông tin deal
npx hardhat blind-escrow:info --id 1

# Hủy deal
npx hardhat blind-escrow:cancel --id 1
```

## 🔧 Cấu hình

### Environment Variables

```env
# packages/site/.env.local
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RELAYER_URL=http://localhost:8545
```

### Mock Tokens

Ứng dụng sử dụng mock ERC20 tokens để demo:
- USDC: 0x1234...
- USDT: 0x2345...
- DAI: 0x3456...

## 🧪 Testing

```bash
# Chạy unit tests
npx hardhat test test/BlindEscrowV2.test.ts

# Test với coverage
npx hardhat coverage
```

## 🔐 FHE Logic

```solidity
// Encrypted comparison
ebool ok1 = FHE.le(eBid, eAsk);      // bid <= ask
ebool ok2 = FHE.le(eAsk, eThr);      // ask <= threshold  
ebool eSuccess = FHE.and(ok1, ok2);  // both conditions

// Decrypt result for settlement
bool success = FHE.decrypt(eSuccess);
```

## 📁 Cấu trúc file

```
packages/
├── fhevm-hardhat-template/
│   ├── contracts/
│   │   ├── BlindEscrowV2.sol      # Main contract
│   │   └── MockERC20.sol          # Test token
│   ├── deploy/
│   │   └── deployBlindEscrowV2.ts # Deploy script
│   ├── tasks/
│   │   └── BlindEscrowV2.ts       # Hardhat tasks
│   └── test/
│       └── BlindEscrowV2.test.ts  # Unit tests
└── site/
    ├── components/
    │   └── BlindEscrowDemo.tsx    # Main UI component
    ├── hooks/
    │   └── useBlindEscrowV2.tsx   # Contract interaction hook
    └── app/
        └── page.tsx               # Home page
```

## 🎨 UI Features

- **Progress Indicator**: Hiển thị tiến trình 4 bước
- **Real-time Updates**: Cập nhật trạng thái deal
- **Error Handling**: Xử lý lỗi và hiển thị thông báo
- **Responsive Design**: Giao diện thân thiện mobile
- **FHE Visualization**: Giải thích logic FHE

## 🔍 Debugging

### Contract Events
- `DealCreated`: Deal được tạo
- `SellerSubmitted`: Seller gửi dữ liệu mã hóa
- `BidPlaced`: Buyer đặt bid và escrow
- `Revealed`: Kết quả FHE comparison
- `Settled`: Giao dịch thành công
- `Refunded`: Hoàn tiền cho buyer

### Common Issues
1. **FHE Permission**: Đảm bảo gọi `FHE.allowThis()` trước khi lưu ciphertext
2. **Token Approval**: Buyer phải approve token trước khi placeBid
3. **Network Config**: Kiểm tra CHAIN_ID và contract address

## 🚀 Mở rộng

### Cách 2: Private Amount Settlement
- Thay vì amount public, có thể mã hóa amount
- Cần oracle/relayer để decrypt amount cho settlement
- Phức tạp hơn nhưng bảo mật hoàn toàn

### Advanced Features
- Multi-token support
- Time-based deals
- Partial fills
- Fee mechanism

## 📚 Tài liệu tham khảo

- [Zama fhEVM Documentation](https://docs.zama.ai/fhevm)
- [FHE Operations](https://docs.zama.ai/fhevm/getting-started/fhe-operations)
- [FHEVM React](https://docs.zama.ai/fhevm/getting-started/fhevm-react)

## 🤝 Đóng góp

1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Push và tạo Pull Request

## 📄 License

MIT License - Xem file LICENSE để biết thêm chi tiết.
