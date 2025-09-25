import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

task("blind-escrow:create", "Create a new blind escrow deal")
  .addParam("mode", "Deal mode: 0=P2P, 1=OPEN")
  .addParam("token", "Payment token address")
  .addParam("amount", "Amount to escrow")
  .addOptionalParam("buyer", "Buyer address (required for P2P mode)")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    
    const contractAddress = process.env.BLIND_ESCROW_ADDRESS;
    if (!contractAddress) {
      throw new Error("BLIND_ESCROW_ADDRESS not set in environment");
    }

    const BlindEscrowV2 = await ethers.getContractFactory("BlindEscrowV2");
    const contract = BlindEscrowV2.attach(contractAddress);

    const [signer] = await ethers.getSigners();
    console.log("Creating deal with signer:", await signer.getAddress());

    const mode = parseInt(taskArgs.mode);
    const amount = ethers.parseEther(taskArgs.amount);
    const buyerOpt = taskArgs.buyer || ethers.ZeroAddress;

    const tx = await contract.createDeal(mode, taskArgs.token, amount, buyerOpt);
    const receipt = await tx.wait();

    // Extract deal ID from event
    const event = receipt.logs.find(log => {
      try {
        const decoded = contract.interface.parseLog(log);
        return decoded.name === "DealCreated";
      } catch {
        return false;
      }
    });

    if (event) {
      const decoded = contract.interface.parseLog(event);
      console.log(`Deal created with ID: ${decoded.args.id}`);
      console.log(`Mode: ${decoded.args.mode === 0 ? "P2P" : "OPEN"}`);
      console.log(`Seller: ${decoded.args.seller}`);
      console.log(`Buyer: ${decoded.args.buyerOpt}`);
      console.log(`Token: ${decoded.args.token}`);
      console.log(`Amount: ${ethers.formatEther(decoded.args.amount)} ETH`);
    }
  });

task("blind-escrow:info", "Get deal information")
  .addParam("id", "Deal ID")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    
    const contractAddress = process.env.BLIND_ESCROW_ADDRESS;
    if (!contractAddress) {
      throw new Error("BLIND_ESCROW_ADDRESS not set in environment");
    }

    const BlindEscrowV2 = await ethers.getContractFactory("BlindEscrowV2");
    const contract = BlindEscrowV2.attach(contractAddress);

    try {
      const dealInfo = await contract.getDealPublic(taskArgs.id);
      
      console.log(`Deal ID: ${taskArgs.id}`);
      console.log(`Mode: ${dealInfo.mode === 0 ? "P2P" : "OPEN"}`);
      console.log(`State: ${getStateName(dealInfo.state)}`);
      console.log(`Seller: ${dealInfo.seller}`);
      console.log(`Buyer: ${dealInfo.buyer}`);
      console.log(`Token: ${dealInfo.token}`);
      console.log(`Amount: ${ethers.formatEther(dealInfo.amount)} ETH`);
      console.log(`Success: ${dealInfo.success ? "Yes" : "No"}`);
    } catch (error: any) {
      console.error("Error fetching deal info:", error.message);
    }
  });

task("blind-escrow:cancel", "Cancel a deal (seller only)")
  .addParam("id", "Deal ID")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;
    
    const contractAddress = process.env.BLIND_ESCROW_ADDRESS;
    if (!contractAddress) {
      throw new Error("BLIND_ESCROW_ADDRESS not set in environment");
    }

    const BlindEscrowV2 = await ethers.getContractFactory("BlindEscrowV2");
    const contract = BlindEscrowV2.attach(contractAddress);

    const [signer] = await ethers.getSigners();
    console.log("Canceling deal with signer:", await signer.getAddress());

    const tx = await contract.sellerCancelBeforeBid(taskArgs.id);
    const receipt = await tx.wait();

    console.log(`Deal ${taskArgs.id} canceled successfully`);
    console.log(`Transaction hash: ${receipt.hash}`);
  });

function getStateName(state: number): string {
  switch (state) {
    case 0: return "None";
    case 1: return "Created";
    case 2: return "A_Submitted";
    case 3: return "Ready";
    case 4: return "Settled";
    case 5: return "Canceled";
    default: return "Unknown";
  }
}
