import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying BlindEscrowMini to Sepolia testnet...");

  // Check environment variables
  const oracleSigner = process.env.ORACLE_SIGNER_ADDRESS;
  if (!oracleSigner) {
    throw new Error("ORACLE_SIGNER_ADDRESS environment variable is required");
  }

  // Get the contract factory
  const BlindEscrowMini = await ethers.getContractFactory("BlindEscrowMini");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

  console.log("Oracle signer address:", oracleSigner);

  // Deploy the contract
  console.log("Deploying contract...");
  const blindEscrowMini = await BlindEscrowMini.deploy(deployer.address, oracleSigner);
  await blindEscrowMini.waitForDeployment();

  const contractAddress = await blindEscrowMini.getAddress();
  console.log("✅ BlindEscrowMini deployed to:", contractAddress);

  // Verify contract version
  const version = await blindEscrowMini.version();
  console.log("Contract version:", version);

  // Verify oracle signer
  const oracleSignerFromContract = await blindEscrowMini.oracleSigner();
  console.log("Oracle signer in contract:", oracleSignerFromContract);

  console.log("\n📋 Sepolia Deployment Summary:");
  console.log("Contract Address:", contractAddress);
  console.log("Deployer:", deployer.address);
  console.log("Oracle Signer:", oracleSigner);
  console.log("Network: Sepolia");
  console.log("Chain ID: 11155111");

  console.log("\n🔧 Environment variables for .env:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`NEXT_PUBLIC_CHAIN_ID=11155111`);
  console.log(`NEXT_PUBLIC_NETWORK=sepolia`);
  console.log(`ORACLE_PRIVATE_KEY=your_oracle_private_key`);

  console.log("\n🔍 Verify contract on Etherscan:");
  console.log(`https://sepolia.etherscan.io/address/${contractAddress}`);

  console.log("\n🚀 Ready to test with BlindEscrowMiniDemo!");

  return {
    contractAddress,
    deployer: deployer.address,
    oracleSigner,
    version
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
