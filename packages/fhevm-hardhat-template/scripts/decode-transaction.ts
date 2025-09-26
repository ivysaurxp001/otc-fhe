import { ethers } from "hardhat";

async function main() {
  console.log("Decoding transaction data...");
  
  // Transaction data from error
  const txData = "0x9c135429000000000000000000000000000000000000000000000000000000000000000cbf5f8c031b63fce04208dd4cafd247a009c8c5114e000000000000aa36a70400e51eb055bb45e0d3f2075ba26ea25f81ffa0bad0e3010000000000aa36a70400";
  
  // Extract function selector (first 4 bytes)
  const selector = txData.slice(0, 10);
  console.log("Function selector:", selector);
  
  // Check common selectors
  const selectors = {
    "0x9c135429": "sellerSubmit(uint256,euint32,euint32)",
    "0x85ee0da4": "createDeal(uint8,address,uint256,address)",
    "0x9056eacb": "sellerSubmit(uint256,bytes32,bytes32)", // Old version
  };
  
  console.log("Possible function:", selectors[selector as keyof typeof selectors] || "Unknown");
  
  // Decode parameters if possible
  try {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    
    if (selector === "0x9c135429") {
      // sellerSubmit(uint256,euint32,euint32)
      const decoded = abiCoder.decode(
        ["uint256", "bytes32", "bytes32"],
        "0x" + txData.slice(10)
      );
      console.log("Decoded parameters:");
      console.log("  dealId:", decoded[0].toString());
      console.log("  encAsk:", decoded[1]);
      console.log("  encThreshold:", decoded[2]);
      console.log("  encAsk length:", decoded[1].length, "chars");
      console.log("  encThreshold length:", decoded[2].length, "chars");
    }
  } catch (error) {
    console.error("Failed to decode:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
