const { buildPoseidon } = require('circomlibjs');
const snarkjs = require('snarkjs');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const LEVELS = 20;
const POOL_ABI = [
  "function withdraw(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, bytes32 _root, bytes32 _nullifierHash, address _recipient, address _relayer, uint256 _fee, uint256 _refund) external payable",
  "function getLastRoot() external view returns (bytes32)",
  "function nextIndex() external view returns (uint32)",
  "function nullifierHashes(bytes32) external view returns (bool)",
  "function zeros(uint256) external view returns (bytes32)",
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const note = JSON.parse(fs.readFileSync("sepolia-note.json", "utf8"));
  console.log("Loaded note for pool:", note.pool);

  const pool = new ethers.Contract(note.pool, POOL_ABI, wallet);
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const nullifier = BigInt(note.nullifier);
  const secret = BigInt(note.secret);
  const commitmentHex = note.commitment;

  // STEP 3: Build Merkle path
  console.log("\n=== Building Merkle path ===");
  const filter = pool.filters.Deposit();
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 49000);
  const events = await pool.queryFilter(filter, fromBlock, "latest");
  console.log("Deposits found in range:", events.length);

  // Find our leaf index
  const leaves = events.map(e => BigInt(e.args.commitment));
  let leafIndex = -1;
  for (let i = 0; i < leaves.length; i++) {
    if ("0x" + leaves[i].toString(16).padStart(64, "0") === commitmentHex.toLowerCase()) {
      leafIndex = i;
      break;
    }
  }
  if (leafIndex === -1) throw new Error("Commitment not found in deposit events");
  console.log("Our leaf index:", leafIndex);

  // Get zeros from contract
  const zeros = [];
  for (let i = 0; i < LEVELS; i++) {
    const z = await pool.zeros(i);
    zeros.push(BigInt(z));
  }

  // Build path for our leaf
  const pathElements = [];
  const pathIndices = [];
  let currentIndex = leafIndex;
  let currentLevel = [...leaves];

  for (let i = 0; i < LEVELS; i++) {
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : zeros[i];
    pathElements.push(F.toString(F.e(sibling.toString())));
    pathIndices.push(currentIndex % 2);

    const nextLevel = [];
    for (let j = 0; j < currentLevel.length; j += 2) {
      const left = currentLevel[j];
      const right = (j + 1) < currentLevel.length ? currentLevel[j + 1] : zeros[i];
      const parent = poseidon([F.e(left.toString()), F.e(right.toString())]);
      nextLevel.push(BigInt(F.toString(parent)));
    }
    currentLevel = nextLevel.length > 0 ? nextLevel : [zeros[i + 1] || 0n];
    currentIndex = Math.floor(currentIndex / 2);
  }
  console.log("Path built (" + pathElements.length + " elements)");

  const onChainRoot = await pool.getLastRoot();
  console.log("On-chain root:", onChainRoot);

  // STEP 4: Generate ZK proof
  console.log("\n=== Generate ZK proof ===");
  const recipient = wallet.address;
  const relayer = "0x0000000000000000000000000000000000000000";
  const fee = "0";
  const refund = "0";

  const input = {
    root: BigInt(onChainRoot).toString(),
    nullifierHash: F.toString(poseidon([F.e(nullifier.toString())])),
    recipient: BigInt(recipient).toString(),
    relayer: BigInt(relayer).toString(),
    fee, refund,
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    pathElements, pathIndices
  };

  const t = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(__dirname, "..", "circuits", "build", "withdraw_js", "withdraw.wasm"),
    path.join(__dirname, "..", "circuits", "build", "withdraw_final.zkey")
  );
  console.log("Proof generated in", Date.now() - t, "ms");

  // STEP 5: Submit withdraw
  console.log("\n=== Withdraw ===");
  const pA = [proof.pi_a[0], proof.pi_a[1]];
  const pB = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]];
  const pC = [proof.pi_c[0], proof.pi_c[1]];
  const nullifierHash = "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, "0");

  const balBefore = await provider.getBalance(recipient);
  const tx = await pool.withdraw(pA, pB, pC, onChainRoot, nullifierHash, recipient, relayer, fee, refund);
  console.log("Withdraw tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber, "Gas:", receipt.gasUsed.toString());

  const balAfter = await provider.getBalance(recipient);
  console.log("Balance change:", ethers.formatEther(balAfter - balBefore), "ETH");
  console.log("Nullifier spent:", await pool.nullifierHashes(nullifierHash));
  console.log("\nhttps://sepolia.etherscan.io/tx/" + tx.hash);
}

main().catch(e => { console.error(e); process.exit(1); });
