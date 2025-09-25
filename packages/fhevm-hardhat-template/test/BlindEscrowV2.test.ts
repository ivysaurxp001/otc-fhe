import { expect } from "chai";
import { ethers } from "hardhat";
import { BlindEscrowV2 } from "../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("BlindEscrowV2", function () {
  async function deployBlindEscrowFixture() {
    const [owner, seller, buyer, other] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Test Token", "TEST", 18);
    await mockToken.waitForDeployment();

    // Mint tokens to buyer
    await mockToken.mint(buyer.address, ethers.parseEther("1000"));

    // Deploy BlindEscrowV2
    const BlindEscrowV2 = await ethers.getContractFactory("BlindEscrowV2");
    const blindEscrow = await BlindEscrowV2.deploy();
    await blindEscrow.waitForDeployment();

    return { blindEscrow, mockToken, owner, seller, buyer, other };
  }

  describe("Deployment", function () {
    it("Should deploy with correct version", async function () {
      const { blindEscrow } = await loadFixture(deployBlindEscrowFixture);
      expect(await blindEscrow.version()).to.equal("BlindEscrowV2:amount-public");
    });

    it("Should start with nextId = 0", async function () {
      const { blindEscrow } = await loadFixture(deployBlindEscrowFixture);
      expect(await blindEscrow.nextId()).to.equal(0);
    });
  });

  describe("createDeal", function () {
    it("Should create P2P deal successfully", async function () {
      const { blindEscrow, mockToken, seller, buyer } = await loadFixture(deployBlindEscrowFixture);
      
      const amount = ethers.parseEther("100");
      const tx = await blindEscrow.connect(seller).createDeal(
        0, // P2P mode
        await mockToken.getAddress(),
        amount,
        buyer.address
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const decoded = blindEscrow.interface.parseLog(log);
          return decoded.name === "DealCreated";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      expect(await blindEscrow.nextId()).to.equal(1);
    });

    it("Should create OPEN deal successfully", async function () {
      const { blindEscrow, mockToken, seller } = await loadFixture(deployBlindEscrowFixture);
      
      const amount = ethers.parseEther("100");
      const tx = await blindEscrow.connect(seller).createDeal(
        1, // OPEN mode
        await mockToken.getAddress(),
        amount,
        ethers.ZeroAddress
      );

      await expect(tx).to.not.be.reverted;
      expect(await blindEscrow.nextId()).to.equal(1);
    });

    it("Should revert with invalid parameters", async function () {
      const { blindEscrow, mockToken, seller, buyer } = await loadFixture(deployBlindEscrowFixture);
      
      const amount = ethers.parseEther("100");

      // Zero payment token
      await expect(
        blindEscrow.connect(seller).createDeal(0, ethers.ZeroAddress, amount, buyer.address)
      ).to.be.revertedWith("paymentToken=0");

      // Zero amount
      await expect(
        blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), 0, buyer.address)
      ).to.be.revertedWith("amount=0");

      // P2P without buyer
      await expect(
        blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), amount, ethers.ZeroAddress)
      ).to.be.revertedWith("buyer required in P2P");

      // OPEN with buyer
      await expect(
        blindEscrow.connect(seller).createDeal(1, await mockToken.getAddress(), amount, buyer.address)
      ).to.be.revertedWith("buyerOpt must be zero in OPEN");
    });
  });

  describe("sellerSubmit", function () {
    it("Should allow seller to submit encrypted values", async function () {
      const { blindEscrow, mockToken, seller, buyer } = await loadFixture(deployBlindEscrowFixture);
      
      // Create deal first
      const amount = ethers.parseEther("100");
      await blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), amount, buyer.address);

      // Mock encrypted values (in real test, these would be actual FHE ciphertexts)
      const encAsk = "0x" + "0".repeat(64);
      const encThreshold = "0x" + "0".repeat(64);

      const tx = await blindEscrow.connect(seller).sellerSubmit(1, encAsk, encThreshold);
      await expect(tx).to.not.be.reverted;
    });

    it("Should revert if not seller", async function () {
      const { blindEscrow, mockToken, seller, buyer, other } = await loadFixture(deployBlindEscrowFixture);
      
      // Create deal first
      const amount = ethers.parseEther("100");
      await blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), amount, buyer.address);

      const encAsk = "0x" + "0".repeat(64);
      const encThreshold = "0x" + "0".repeat(64);

      await expect(
        blindEscrow.connect(other).sellerSubmit(1, encAsk, encThreshold)
      ).to.be.revertedWith("not seller");
    });
  });

  describe("placeBid", function () {
    it("Should allow buyer to place bid in P2P mode", async function () {
      const { blindEscrow, mockToken, seller, buyer } = await loadFixture(deployBlindEscrowFixture);
      
      // Create deal and submit seller data
      const amount = ethers.parseEther("100");
      await blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), amount, buyer.address);
      
      const encAsk = "0x" + "0".repeat(64);
      const encThreshold = "0x" + "0".repeat(64);
      await blindEscrow.connect(seller).sellerSubmit(1, encAsk, encThreshold);

      // Approve tokens
      await mockToken.connect(buyer).approve(await blindEscrow.getAddress(), amount);

      // Place bid
      const encBid = "0x" + "0".repeat(64);
      const tx = await blindEscrow.connect(buyer).placeBid(1, encBid);
      await expect(tx).to.not.be.reverted;
    });

    it("Should revert if not approved buyer", async function () {
      const { blindEscrow, mockToken, seller, buyer, other } = await loadFixture(deployBlindEscrowFixture);
      
      // Create deal and submit seller data
      const amount = ethers.parseEther("100");
      await blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), amount, buyer.address);
      
      const encAsk = "0x" + "0".repeat(64);
      const encThreshold = "0x" + "0".repeat(64);
      await blindEscrow.connect(seller).sellerSubmit(1, encAsk, encThreshold);

      // Try to place bid with wrong address
      const encBid = "0x" + "0".repeat(64);
      await expect(
        blindEscrow.connect(other).placeBid(1, encBid)
      ).to.be.revertedWith("buyer fixed");
    });
  });

  describe("revealAndSettle", function () {
    it("Should settle successfully when conditions are met", async function () {
      const { blindEscrow, mockToken, seller, buyer } = await loadFixture(deployBlindEscrowFixture);
      
      // Create deal, submit seller data, and place bid
      const amount = ethers.parseEther("100");
      await blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), amount, buyer.address);
      
      const encAsk = "0x" + "0".repeat(64);
      const encThreshold = "0x" + "0".repeat(64);
      await blindEscrow.connect(seller).sellerSubmit(1, encAsk, encThreshold);

      await mockToken.connect(buyer).approve(await blindEscrow.getAddress(), amount);
      const encBid = "0x" + "0".repeat(64);
      await blindEscrow.connect(buyer).placeBid(1, encBid);

      // Reveal and settle (note: in real test, FHE operations would determine outcome)
      const tx = await blindEscrow.connect(seller).revealAndSettle(1);
      await expect(tx).to.not.be.reverted;
    });
  });

  describe("sellerCancelBeforeBid", function () {
    it("Should allow seller to cancel before bid", async function () {
      const { blindEscrow, mockToken, seller, buyer } = await loadFixture(deployBlindEscrowFixture);
      
      // Create deal
      const amount = ethers.parseEther("100");
      await blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), amount, buyer.address);

      // Cancel deal
      const tx = await blindEscrow.connect(seller).sellerCancelBeforeBid(1);
      await expect(tx).to.not.be.reverted;
    });

    it("Should revert if not seller", async function () {
      const { blindEscrow, mockToken, seller, buyer, other } = await loadFixture(deployBlindEscrowFixture);
      
      // Create deal
      const amount = ethers.parseEther("100");
      await blindEscrow.connect(seller).createDeal(0, await mockToken.getAddress(), amount, buyer.address);

      // Try to cancel with wrong address
      await expect(
        blindEscrow.connect(other).sellerCancelBeforeBid(1)
      ).to.be.revertedWith("not seller");
    });
  });
});
