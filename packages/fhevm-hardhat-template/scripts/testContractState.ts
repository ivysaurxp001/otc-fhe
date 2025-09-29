import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Testing contract state...");

  const contractAddress = "0x4dedE32aCC41fcB3bA9Aa4bb3B99D0Fa8541CeAf";
  
  // Get contract instance
  const BlindEscrowMini = await ethers.getContractFactory("BlindEscrowMini");
  const contract = BlindEscrowMini.attach(contractAddress);

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  try {
    // Check contract version
    const version = await contract.version();
    console.log("✅ Contract version:", version);

    // Check oracle signer
    const oracleSigner = await contract.oracleSigner();
    console.log("✅ Oracle signer:", oracleSigner);

    // Check next ID
    const nextId = await contract.nextId();
    console.log("✅ Next deal ID:", nextId.toString());

    // Test creating a deal
    console.log("\n🧪 Testing deal creation...");
    const testBuyer = "0x1234567890123456789012345678901234567890";
    const testAmount = ethers.parseEther("0.1");
    
    const tx = await contract.createDeal(testBuyer, testAmount);
    const receipt = await tx.wait();
    console.log("✅ Deal created! Transaction hash:", receipt?.hash);

    // Get deal info
    const dealInfo = await contract.getDealPublic(1);
    console.log("✅ Deal info:", {
      seller: dealInfo[0],
      buyer: dealInfo[1],
      amount: ethers.formatEther(dealInfo[2]),
      success: dealInfo[3],
      state: dealInfo[4]
    });

    // Check if deal is in correct state for sellerSubmit
    const dealState = Number(dealInfo[4]);
    console.log("✅ Deal state:", dealState);
    
    if (dealState === 1) {
      console.log("✅ Deal is in correct state (Created) for sellerSubmit");
    } else {
      console.log("❌ Deal is in wrong state. Expected 1 (Created), got", dealState);
    }

    // Check if caller is the seller
    const isSeller = dealInfo[0].toLowerCase() === deployer.address.toLowerCase();
    console.log("✅ Is caller the seller?", isSeller);

    if (isSeller && dealState === 1) {
      console.log("✅ Contract is ready for sellerSubmit");
    } else {
      console.log("❌ Contract is not ready for sellerSubmit");
      if (!isSeller) {
        console.log("   - Caller is not the seller");
      }
      if (dealState !== 1) {
        console.log("   - Deal state is not Created");
      }
    }

  } catch (error: any) {
    console.error("❌ Error testing contract:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
