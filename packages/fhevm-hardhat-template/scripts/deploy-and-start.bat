@echo off
echo 🚀 Starting BlindEscrowMini deployment process...

REM Check if hardhat node is running
curl -s http://localhost:8545 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Hardhat node is already running
) else (
    echo 🔄 Starting hardhat node in background...
    start /B npx hardhat node --hostname 0.0.0.0
    
    REM Wait for hardhat node to start
    echo ⏳ Waiting for hardhat node to start...
    for /L %%i in (1,1,30) do (
        curl -s http://localhost:8545 >nul 2>&1
        if !errorlevel! equ 0 (
            echo ✅ Hardhat node is ready!
            goto :deploy
        )
        echo Waiting... (%%i/30)
        timeout /t 2 /nobreak >nul
    )
)

:deploy
echo 📦 Deploying BlindEscrowMini contract...
npx hardhat run scripts/deployBlindEscrowMiniLocal.ts --network localhost

echo ✅ Deployment complete!
echo.
echo 🔧 Next steps:
echo 1. Copy the contract address to your .env.local file
echo 2. Start your Next.js frontend: npm run dev
echo 3. Open http://localhost:3000 and test BlindEscrowMiniDemo
echo.
echo 💡 To stop hardhat node: Close the terminal or Ctrl+C
