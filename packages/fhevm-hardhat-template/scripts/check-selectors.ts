import { ethers } from "hardhat";

async function main() {
  console.log("Checking function selectors...");
  
  const iface = new ethers.Interface([
    "function createDeal(uint8 mode, address paymentToken, uint256 amount, address buyerOpt) external returns (uint256)",
    "function sellerSubmit(uint256 id, euint32 encAsk, euint32 encThreshold) external",
    "function placeBid(uint256 id, euint32 encBid) external",
    "function computeOutcome(uint256 id) external",
    "function finalizeWithOracle(uint256 id, bool outcome, bytes signature) external"
  ]);
  
  console.log("Function selectors:");
  console.log("- createDeal:", iface.getFunction("createDeal").selector);
  console.log("- sellerSubmit:", iface.getFunction("sellerSubmit").selector);
  console.log("- placeBid:", iface.getFunction("placeBid").selector);
  console.log("- computeOutcome:", iface.getFunction("computeOutcome").selector);
  console.log("- finalizeWithOracle:", iface.getFunction("finalizeWithOracle").selector);
  
  // Check what function the error selector belongs to
  const errorSelector = "0x9056eacb";
  console.log(`\nError selector ${errorSelector} belongs to:`, iface.getFunction(errorSelector)?.name || "UNKNOWN FUNCTION");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

