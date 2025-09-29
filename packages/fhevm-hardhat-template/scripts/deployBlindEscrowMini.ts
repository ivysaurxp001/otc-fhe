import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying BlindEscrowMini contract...");

  // Get the contract factory
  const BlindEscrowMini = await ethers.getContractFactory("BlindEscrowMini");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Oracle signer address (you can change this)
  const oracleSigner = process.env.ORACLE_SIGNER_ADDRESS || deployer.address;
  console.log("Oracle signer address:", oracleSigner);

  // Deploy the contract
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

  // Create a test deal to verify functionality
  console.log("\n🧪 Testing contract functionality...");
  
  try {
    // Create a test deal
    const testBuyer = "0x1234567890123456789012345678901234567890"; // Dummy buyer address
    const testAmount = ethers.parseEther("0.1"); // 0.1 ETH
    
    console.log("Creating test deal...");
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
    
  } catch (error) {
    console.log("⚠️ Test deal creation failed (this is normal if not on testnet):", error);
  }

  console.log("\n📋 Deployment Summary:");
  console.log("Contract Address:", contractAddress);
  console.log("Deployer:", deployer.address);
  console.log("Oracle Signer:", oracleSigner);
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);

  console.log("\n🔧 Next steps:");
  console.log("1. Copy the contract address to your .env file:");
  console.log(`   NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("2. Set the oracle signer private key:");
  console.log("   ORACLE_PRIVATE_KEY=your_oracle_private_key");
  console.log("3. Update your frontend to use BlindEscrowMiniDemo component");

  return {
    contractAddress,
    deployer: deployer.address,
    oracleSigner,
    version
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
