const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FederatedAggregator + BlockFLToken", function () {
  let token, agg, owner, n1, n2, n3, outsider;
  const REWARD = ethers.parseUnits("900", 18);

  beforeEach(async () => {
    [owner, n1, n2, n3, outsider] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("BlockFLToken");
    token = await Token.deploy();

    const Agg = await ethers.getContractFactory("FederatedAggregator");
    agg = await Agg.deploy(await token.getAddress(), 3, REWARD);

    await token.setMinter(await agg.getAddress());
    for (const n of [n1, n2, n3]) await agg.registerNode(n.address);
  });

  const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

  it("dang ky node va chan node trung lap", async () => {
    expect(await agg.isNode(n1.address)).to.equal(true);
    expect(await agg.nodeCount()).to.equal(3);
    await expect(agg.registerNode(n1.address)).to.be.revertedWith("AGG: already registered");
  });

  it("chi node da dang ky moi duoc submit", async () => {
    await expect(
      agg.connect(outsider).submitWeights(h("w"), 10, 1)
    ).to.be.revertedWith("AGG: not a registered node");
  });

  it("chan submit sai round va submit 2 lan", async () => {
    await expect(agg.connect(n1).submitWeights(h("w"), 10, 2)).to.be.revertedWith("AGG: wrong round");
    await agg.connect(n1).submitWeights(h("w1"), 10, 1);
    await expect(agg.connect(n1).submitWeights(h("w1b"), 5, 1)).to.be.revertedWith("AGG: already submitted");
  });

  it("khong aggregate khi chua du node", async () => {
    await agg.connect(n1).submitWeights(h("w1"), 10, 1);
    await expect(agg.aggregate(1, h("global"))).to.be.revertedWith("AGG: not enough submissions");
  });

  it("luong day du: submit -> aggregate -> distributeReward -> advanceRound", async () => {
    await agg.connect(n1).submitWeights(h("w1"), 100, 1);
    await agg.connect(n2).submitWeights(h("w2"), 200, 1);
    await agg.connect(n3).submitWeights(h("w3"), 300, 1);

    await expect(agg.aggregate(1, h("global-1")))
      .to.emit(agg, "ModelAggregated")
      .withArgs(1, h("global-1"), 600, 3);

    await agg.distributeReward(1);
    // tong mau = 600, reward = 900 -> 150 / 300 / 450
    expect(await token.balanceOf(n1.address)).to.equal(ethers.parseUnits("150", 18));
    expect(await token.balanceOf(n2.address)).to.equal(ethers.parseUnits("300", 18));
    expect(await token.balanceOf(n3.address)).to.equal(ethers.parseUnits("450", 18));

    // distribute lan 2 khong mint them
    await agg.distributeReward(1);
    expect(await token.totalSupply()).to.equal(ethers.parseUnits("900", 18));

    await agg.advanceRound();
    expect(await agg.currentRound()).to.equal(2);
  });

  it("chi owner moi aggregate / distribute / advance", async () => {
    await agg.connect(n1).submitWeights(h("w1"), 100, 1);
    await agg.connect(n2).submitWeights(h("w2"), 100, 1);
    await agg.connect(n3).submitWeights(h("w3"), 100, 1);
    await expect(agg.connect(n1).aggregate(1, h("g"))).to.be.revertedWith("AGG: not owner");
  });
});
