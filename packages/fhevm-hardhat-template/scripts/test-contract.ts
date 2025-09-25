import { ethers } from "hardhat";

async function main() {
  console.log("Testing BlindEscrowV2 contract...");

  const contractAddress = "0x40e8bAb048C3a37Ab4d03c99D860CCDC88D06dD7";
  const [deployer] = await ethers.getSigners();
  
  console.log("Testing with account:", deployer.address);
  console.log("Contract address:", contractAddress);

  try {
    // Try to get contract code
    const code = await deployer.provider.getCode(contractAddress);
    console.log("Contract code length:", code.length);
    
    if (code === "0x") {
      console.log("❌ Contract not found at address!");
      return;
    }
    
    console.log("✅ Contract exists at address");

    // Try to create contract instance
    const contract = new ethers.Contract(
      contractAddress,
      [
        "function createDeal(uint8 mode, address paymentToken, uint256 amount, address buyerOpt) external returns (uint256)",
        "function version() external pure returns (string memory)",
        "function getDealPublic(uint256 id) external view returns (uint8 mode, uint8 state, address seller, address buyer, address token, uint256 amount, bool success)"
      ],
      deployer
    );

    // Test version function
    try {
      const version = await contract.version();
      console.log("✅ Contract version:", version);
    } catch (err) {
      console.log("❌ Error calling version():", err.message);
    }

    // Test createDeal with mock data
    const testToken = "0xeFEb320129FBFba5b54584BA57DcaD4754F72C11"; // USDC
    const testAmount = ethers.parseUnits("100", 18);
    
    try {
      console.log("Testing createDeal...");
      const tx = await contract.createDeal.staticCall(
        1, // OPEN mode
        testToken,
        testAmount,
        ethers.ZeroAddress
      );
      console.log("✅ createDeal static call successful, would return deal ID:", tx.toString());
    } catch (err) {
      console.log("❌ Error in createDeal static call:", err.message);
    }

  } catch (err) {
    console.log("❌ Error:", err.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

