import { ethers } from "hardhat";

async function main() {
  console.log("Decoding transaction data...");
  
  const txData = "0x9056eacb0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001";
  
  // Get function selector
  const functionSelector = txData.slice(0, 10);
  console.log("Function selector:", functionSelector);
  
  // Get parameters
  const params = txData.slice(10);
  console.log("Parameters:", params);
  
  // Try to decode with createDeal function
  try {
    const iface = new ethers.Interface([
      "function createDeal(uint8 mode, address paymentToken, uint256 amount, address buyerOpt) external returns (uint256)"
    ]);
    
    const decoded = iface.parseTransaction({ data: txData });
    console.log("Decoded parameters:");
    console.log("- mode:", decoded.args[0].toString());
    console.log("- paymentToken:", decoded.args[1]);
    console.log("- amount:", decoded.args[2].toString());
    console.log("- buyerOpt:", decoded.args[3]);
    
    // Check if parameters are valid
    console.log("\nValidation:");
    console.log("- mode (3):", decoded.args[0].toString() === "3" ? "❌ INVALID (should be 0 or 1)" : "✅ Valid");
    console.log("- paymentToken:", decoded.args[1] === "0x0000000000000000000000000000000000000000" ? "❌ INVALID (zero address)" : "✅ Valid");
    console.log("- amount:", decoded.args[2].toString() === "0" ? "❌ INVALID (zero amount)" : "✅ Valid");
    console.log("- buyerOpt:", decoded.args[3] === "0x0000000000000000000000000000000000000000" ? "✅ Valid (zero for OPEN mode)" : "❌ INVALID");
    
  } catch (error) {
    console.error("Error decoding:", error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
