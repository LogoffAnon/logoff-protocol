const { buildPoseidon } = require('circomlibjs');
const snarkjs = require('snarkjs');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const POOL_ADDRESS = "0x003230A7d131AB491cdFe1A9a162D7FCB738df04"; // Pool 0.01 ETH
const DENOMINATION = ethers.parseEther("0.01");
const LEVELS = 20;

const POOL_ABI = [
  "function deposit(bytes32 _commitment) external payable",
  "function withdraw(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, bytes32 _root, bytes32 _nullifierHash, address _recipient, address _relayer, uint256 _fee, uint256 _refund) external payable",
  "function getLastRoot() external view returns (bytes32)",
  "function nextIndex() external view returns (uint32)",
  "function commitments(bytes32) external view returns (bool)",
  "function nullifierHashes(bytes32) external view returns (bool)",
  "function zeros(uint256) external view returns (bytes32)",
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const pool = new ethers.Contract(POOL_ADDRESS, POOL_ABI, wallet);

  console.log("Wallet:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // STEP 1: Generate nullifier + secret + commitment
  const nullifier = BigInt("0x" + require('crypto').randomBytes(31).toString('hex'));
  const secret = BigInt("0x" + require('crypto').randomBytes(31).toString('hex'));
  const commitment = poseidon([F.e(nullifier.toString()), F.e(secret.toString())]);
  const commitmentHex = "0x" + F.toString(commitment, 16).padStart(64, '0');

  console.log("\n=== STEP 1: Commitment generated ===");
  console.log("Nullifier:", nullifier.toString());
  console.log("Secret:", secret.toString());
  console.log("Commitment:", commitmentHex);

  // Save note for user
  const noteData = {
    pool: POOL_ADDRESS,
    denomination: "0.01 ETH",
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    commitment: commitmentHex
  };
  fs.writeFileSync("sepolia-note.json", JSON.stringify(noteData, null, 2));
  console.log("Note saved to sepolia-note.json");

  // STEP 2: Deposit
  console.log("\n=== STEP 2: Deposit ===");
  const indexBefore = await pool.nextIndex();
  console.log("Index before deposit:", indexBefore);

  const depositTx = await pool.deposit(commitmentHex, { value: DENOMINATION });
  console.log("Deposit tx:", depositTx.hash);
  const depositReceipt = await depositTx.wait();
  console.log("Deposit confirmed in block:", depositReceipt.blockNumber);
  console.log("Gas used:", depositReceipt.gasUsed.toString());

  const indexAfter = await pool.nextIndex();
  const leafIndex = Number(indexBefore);
  console.log("Leaf index:", leafIndex);

  // STEP 3: Build Merkle path for this commitment
  console.log("\n=== STEP 3: Building Merkle path ===");

  const filter = pool.filters.Deposit();
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 49000);
  const events = await pool.queryFilter(filter, fromBlock, "latest");
  console.log("Total deposits in pool:", events.length);

  // Build the tree from all deposits
  const leaves = events.map(e => BigInt(e.args.commitment));
  console.log("Leaves:", leaves.map(l => l.toString().slice(0, 20) + "..."));

  // Get zero values from contract
  const zeros = [];
  for (let i = 0; i < LEVELS; i++) {
    const z = await pool.zeros(i);
    zeros.push(BigInt(z));
  }

  // Compute path for our commitment at leafIndex
  const pathElements = [];
  const pathIndices = [];
  let currentIndex = leafIndex;
  let currentLevel = [...leaves];

  for (let i = 0; i < LEVELS; i++) {
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

    // Get sibling (might be a zero if it's beyond currentLevel)
    let sibling;
    if (siblingIndex < currentLevel.length) {
      sibling = currentLevel[siblingIndex];
    } else {
      sibling = zeros[i];
    }

    pathElements.push(F.toString(F.e(sibling.toString())));
    pathIndices.push(currentIndex % 2);

    // Compute next level
    const nextLevel = [];
    for (let j = 0; j < currentLevel.length; j += 2) {
      const left = j < currentLevel.length ? currentLevel[j] : zeros[i];
      const right = (j + 1) < currentLevel.length ? currentLevel[j + 1] : zeros[i];
      const parent = poseidon([F.e(left.toString()), F.e(right.toString())]);
      nextLevel.push(BigInt(F.toString(parent)));
    }
    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);

    if (currentLevel.length === 0) {
      // Hit the top, remaining levels all zeros
      currentLevel = [zeros[i + 1] || 0n];
    }
  }

  console.log("Path built with", pathElements.length, "elements");

  // Verify path produces a valid root
  const onChainRoot = await pool.getLastRoot();
  console.log("On-chain root:", onChainRoot);

  // STEP 4: Generate ZK proof
  console.log("\n=== STEP 4: Generate ZK proof ===");

  const recipient = wallet.address; // withdraw to self for test
  const relayer = "0x0000000000000000000000000000000000000000";
  const fee = "0";
  const refund = "0";

  const input = {
    root: BigInt(onChainRoot).toString(),
    nullifierHash: F.toString(poseidon([F.e(nullifier.toString())])),
    recipient: BigInt(recipient).toString(),
    relayer: BigInt(relayer).toString(),
    fee: fee,
    refund: refund,
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    pathElements: pathElements,
    pathIndices: pathIndices
  };

  console.log("Generating proof...");
  const proofStart = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(__dirname, "..", "circuits", "build", "withdraw_js", "withdraw.wasm"),
    path.join(__dirname, "..", "circuits", "build", "withdraw_final.zkey")
  );
  console.log("Proof generated in", Date.now() - proofStart, "ms");

  // STEP 5: Withdraw
  console.log("\n=== STEP 5: Withdraw ===");

  const pA = [proof.pi_a[0], proof.pi_a[1]];
  const pB = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]]
  ];
  const pC = [proof.pi_c[0], proof.pi_c[1]];

  const nullifierHash = "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, '0');

  const balBefore = await provider.getBalance(recipient);

  const withdrawTx = await pool.withdraw(
    pA, pB, pC,
    onChainRoot,
    nullifierHash,
    recipient,
    relayer,
    fee,
    refund
  );
  console.log("Withdraw tx:", withdrawTx.hash);
  const withdrawReceipt = await withdrawTx.wait();
  console.log("Withdraw confirmed in block:", withdrawReceipt.blockNumber);
  console.log("Gas used:", withdrawReceipt.gasUsed.toString());

  const balAfter = await provider.getBalance(recipient);
  console.log("\nBalance change:", ethers.formatEther(balAfter - balBefore), "ETH (minus gas)");

  const isSpent = await pool.nullifierHashes(nullifierHash);
  console.log("Nullifier marked as spent:", isSpent);

  console.log("\n=== SUCCESS - Full flow completed on Sepolia ===");
  console.log("Deposit tx: https://sepolia.etherscan.io/tx/" + depositTx.hash);
  console.log("Withdraw tx: https://sepolia.etherscan.io/tx/" + withdrawTx.hash);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
