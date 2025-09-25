@echo off
setlocal enabledelayedexpansion

REM *****************************************************************************
REM Config Parameters
REM *****************************************************************************

set CONTRACTS_PACKAGE_DIR=fhevm-hardhat-template
set HARDHAT_NODE_PORT=8545
set HARDHAT_NODE_HOST=127.0.0.1
set HARDHAT_NODE_URL=http://%HARDHAT_NODE_HOST%:%HARDHAT_NODE_PORT%
set TIMEOUT_SECONDS=60
set CHECK_INTERVAL_SECONDS=1

REM *****************************************************************************

cd /d "%~dp0..\packages\%CONTRACTS_PACKAGE_DIR%"

REM Check if Hardhat Node is already running
curl -s -X POST -H "Content-Type: application/json" --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_chainId\",\"params\":[],\"id\":1}" "%HARDHAT_NODE_URL%" >nul 2>&1
if %errorlevel% equ 0 (
    echo Hardhat Node is ready!
    npx hardhat deploy --network localhost
    exit /b 0
)

echo --- Starting Hardhat Node in background ---
start /b npx hardhat node >nul 2>&1

echo Hardhat Node started. Waiting for it to be ready...

REM Wait for Hardhat Node to be ready
set ATTEMPTS=0
:wait_loop
if %ATTEMPTS% geq %TIMEOUT_SECONDS% (
    echo Error: Hardhat Node did not start within %TIMEOUT_SECONDS% seconds.
    taskkill /f /im node.exe >nul 2>&1
    exit /b 1
)

curl -s -X POST -H "Content-Type: application/json" --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_chainId\",\"params\":[],\"id\":1}" "%HARDHAT_NODE_URL%" >nul 2>&1
if %errorlevel% equ 0 (
    echo Hardhat Node is ready!
    goto deploy
)

set /a ATTEMPTS+=1
echo Waiting for Hardhat Node... (Attempt %ATTEMPTS%/%TIMEOUT_SECONDS%)
timeout /t %CHECK_INTERVAL_SECONDS% /nobreak >nul
goto wait_loop

:deploy
echo --- Deploying FHECounter.sol on Hardhat Node ---
npx hardhat deploy --network localhost
set TEST_EXIT_CODE=%errorlevel%

echo --- Stopping Hardhat Node ---
taskkill /f /im node.exe >nul 2>&1

REM Add extra sleep to avoid possible conflict with next server instance launch
timeout /t 1 /nobreak >nul

exit /b %TEST_EXIT_CODE%
