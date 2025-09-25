import { ethers } from "hardhat";

async function main() {
  console.log("Checking function selectors...");
  
  // Test with our ABI
  const iface = new ethers.Interface([
    "function sellerSubmit(uint256 id, bytes encAsk, bytes encThreshold) external"
  ]);
  
  const selector = iface.getFunction("sellerSubmit").selector;
  console.log("sellerSubmit selector:", selector);
  
  // Test with createDeal
  const iface2 = new ethers.Interface([
    "function createDeal(uint8 mode, address paymentToken, uint256 amount, address buyerOpt) external returns (uint256)"
  ]);
  
  const selector2 = iface2.getFunction("createDeal").selector;
  console.log("createDeal selector:", selector2);
  
  // Check what the error selector is
  const errorSelector = "0x9056eacb";
  console.log("Error selector:", errorSelector);
  console.log("Matches createDeal:", selector2 === errorSelector);
  console.log("Matches sellerSubmit:", selector === errorSelector);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
