const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Cau hinh demo
const MIN_NODES = process.env.MIN_NODES ? parseInt(process.env.MIN_NODES) : 3;
const REWARD_PER_ROUND = ethers.parseUnits(
  process.env.REWARD_PER_ROUND || "1000",
  18
);
// So node bion se dang ky (lay tu cac account Hardhat, bo qua account[0] = owner)
const NUM_NODES = process.env.NUM_NODES ? parseInt(process.env.NUM_NODES) : 4;

async function main() {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  const nodeSigners = signers.slice(1, 1 + NUM_NODES);

  console.log(`Network      : ${network.name}`);
  console.log(`Owner        : ${owner.address}`);

  const Token = await ethers.getContractFactory("BlockFLToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`BlockFLToken : ${tokenAddr}`);

  const Agg = await ethers.getContractFactory("FederatedAggregator");
  const agg = await Agg.deploy(tokenAddr, MIN_NODES, REWARD_PER_ROUND);
  await agg.waitForDeployment();
  const aggAddr = await agg.getAddress();
  console.log(`Aggregator   : ${aggAddr}`);

  // Chuyen quyen mint token cho aggregator
  await (await token.setMinter(aggAddr)).wait();
  console.log(`Minter set   -> ${aggAddr}`);

  // Dang ky cac node
  const nodeAddrs = [];
  for (const s of nodeSigners) {
    await (await agg.registerNode(s.address)).wait();
    nodeAddrs.push(s.address);
    console.log(`Registered   : ${s.address}`);
  }

  // Ghi thong tin trien khai ra file de phia Python doc
  const artTokenPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "BlockFLToken.sol",
    "BlockFLToken.json"
  );
  const artAggPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "FederatedAggregator.sol",
    "FederatedAggregator.json"
  );
  const tokenAbi = JSON.parse(fs.readFileSync(artTokenPath)).abi;
  const aggAbi = JSON.parse(fs.readFileSync(artAggPath)).abi;

  const out = {
    network: network.name,
    rpcUrl: network.config.url || "http://127.0.0.1:8545",
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    minNodes: MIN_NODES,
    rewardPerRound: REWARD_PER_ROUND.toString(),
    owner: owner.address,
    token: { address: tokenAddr, abi: tokenAbi },
    aggregator: { address: aggAddr, abi: aggAbi },
    nodes: nodeAddrs,
  };

  const deployDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deployDir, { recursive: true });
  const outPath = path.join(deployDir, `${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nDeployment info -> ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
