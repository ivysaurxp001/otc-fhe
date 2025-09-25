import { ethers } from "hardhat";

async function main() {
  console.log("Deploying Mock ERC20 tokens...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Deploy USDC (6 decimals)
  const USDC = await ethers.getContractFactory("MockERC20");
  const usdc = await USDC.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`USDC deployed to: ${usdcAddress}`);

  // Deploy USDT (6 decimals)
  const USDT = await ethers.getContractFactory("MockERC20");
  const usdt = await USDT.deploy("Tether USD", "USDT", 6);
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log(`USDT deployed to: ${usdtAddress}`);

  // Deploy DAI (18 decimals)
  const DAI = await ethers.getContractFactory("MockERC20");
  const dai = await DAI.deploy("Dai Stablecoin", "DAI", 18);
  await dai.waitForDeployment();
  const daiAddress = await dai.getAddress();
  console.log(`DAI deployed to: ${daiAddress}`);

  // Mint tokens for deployer (for testing)
  const mintAmount = ethers.parseUnits("1000000", 18); // 1M tokens
  
  console.log("\nMinting tokens for testing...");
  
  // Mint USDC (6 decimals)
  const usdcMintAmount = ethers.parseUnits("1000000", 6);
  await usdc.mint(deployer.address, usdcMintAmount);
  console.log(`Minted 1,000,000 USDC to ${deployer.address}`);
  
  // Mint USDT (6 decimals)
  const usdtMintAmount = ethers.parseUnits("1000000", 6);
  await usdt.mint(deployer.address, usdtMintAmount);
  console.log(`Minted 1,000,000 USDT to ${deployer.address}`);
  
  // Mint DAI (18 decimals)
  await dai.mint(deployer.address, mintAmount);
  console.log(`Minted 1,000,000 DAI to ${deployer.address}`);

  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log(`USDC Address: ${usdcAddress}`);
  console.log(`USDT Address: ${usdtAddress}`);
  console.log(`DAI Address: ${daiAddress}`);
  console.log(`Deployer: ${deployer.address}`);
  
  console.log("\n=== ENV VARIABLES TO UPDATE ===");
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
  console.log(`NEXT_PUBLIC_USDT_ADDRESS=${usdtAddress}`);
  console.log(`NEXT_PUBLIC_DAI_ADDRESS=${daiAddress}`);
  
  console.log("\n=== NEXT STEPS ===");
  console.log("1. Copy the addresses above to your .env file");
  console.log("2. Restart your frontend application");
  console.log("3. Connect your wallet to test the tokens");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
