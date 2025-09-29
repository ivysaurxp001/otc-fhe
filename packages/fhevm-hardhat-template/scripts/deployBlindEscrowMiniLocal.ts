import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying BlindEscrowMini to local hardhat node...");

  // Get the contract factory
  const BlindEscrowMini = await ethers.getContractFactory("BlindEscrowMini");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

  // Use deployer as oracle signer for local testing
  const oracleSigner = deployer.address;
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

  // Create a test deal
  console.log("\n🧪 Creating test deal...");
  const testBuyer = "0x1234567890123456789012345678901234567890"; // Dummy buyer address
  const testAmount = ethers.parseEther("0.1"); // 0.1 ETH
  
  const tx = await blindEscrowMini.createDeal(testBuyer, testAmount);
  const receipt = await tx.wait();
  
  console.log("✅ Test deal created successfully!");
  console.log("Transaction hash:", receipt?.hash);
  
  // Get deal info
  const dealInfo = await blindEscrowMini.getDealPublic(1);
  console.log("Deal info:", {
    seller: dealInfo[0],
    buyer: dealInfo[1],
    amount: ethers.formatEther(dealInfo[2]),
    success: dealInfo[3],
    state: dealInfo[4]
  });

  console.log("\n📋 Local Deployment Summary:");
  console.log("Contract Address:", contractAddress);
  console.log("Deployer:", deployer.address);
  console.log("Oracle Signer:", oracleSigner);
  console.log("Network: localhost");

  console.log("\n🔧 Environment variables for .env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`NEXT_PUBLIC_CHAIN_ID=31337`);
  console.log(`NEXT_PUBLIC_NETWORK=localhost`);
  console.log(`ORACLE_PRIVATE_KEY=${await deployer.getAddress()}`);

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
