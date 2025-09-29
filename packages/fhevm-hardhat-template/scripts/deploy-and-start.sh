#!/bin/bash

echo "🚀 Starting BlindEscrowMini deployment process..."

# Check if hardhat node is running
if curl -s http://localhost:8545 > /dev/null; then
    echo "✅ Hardhat node is already running"
else
    echo "🔄 Starting hardhat node in background..."
    npx hardhat node --hostname 0.0.0.0 &
    HARDHAT_PID=$!
    
    # Wait for hardhat node to start
    echo "⏳ Waiting for hardhat node to start..."
    for i in {1..30}; do
        if curl -s http://localhost:8545 > /dev/null; then
            echo "✅ Hardhat node is ready!"
            break
        fi
        echo "Waiting... ($i/30)"
        sleep 2
    done
fi

# Deploy contract
echo "📦 Deploying BlindEscrowMini contract..."
npx hardhat run scripts/deployBlindEscrowMiniLocal.ts --network localhost

echo "✅ Deployment complete!"
echo ""
echo "🔧 Next steps:"
echo "1. Copy the contract address to your .env.local file"
echo "2. Start your Next.js frontend: npm run dev"
echo "3. Open http://localhost:3000 and test BlindEscrowMiniDemo"
echo ""
echo "💡 To stop hardhat node: kill $HARDHAT_PID"
