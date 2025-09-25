import { ethers } from "hardhat";

async function main() {
  const ORACLE = process.env.ORACLE_SIGNER!; // ví off-chain dùng để ký
  
  if (!ORACLE) {
    throw new Error("ORACLE_SIGNER environment variable is required");
  }

  // Get deployer address
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  
  console.log("Deploying BlindEscrowV2_Oracle with:");
  console.log("- Deployer/Owner:", deployerAddress);
  console.log("- Oracle signer:", ORACLE);
  
  const Fac = await ethers.getContractFactory("BlindEscrowV2_Oracle");
  const c = await Fac.deploy(deployerAddress, ORACLE);
  await c.waitForDeployment();
  
  const address = await c.getAddress();
  console.log("Deployed BlindEscrowV2_Oracle at:", address);
  
  // Verify settings
  const owner = await c.owner();
  const oracleSigner = await c.oracleSigner();
  console.log("Owner set to:", owner);
  console.log("Oracle signer set to:", oracleSigner);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
