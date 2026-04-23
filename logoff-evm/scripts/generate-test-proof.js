const { buildPoseidon } = require('circomlibjs');
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Generate a random nullifier and secret (31 bytes = 248 bits, fits in BN254 field)
  const nullifier = BigInt("0x" + require('crypto').randomBytes(31).toString('hex'));
  const secret = BigInt("0x" + require('crypto').randomBytes(31).toString('hex'));

  // Commitment = Poseidon(nullifier, secret)
  const commitment = poseidon([F.e(nullifier.toString()), F.e(secret.toString())]);
  const commitmentStr = F.toString(commitment);

  // NullifierHash = Poseidon(nullifier)
  const nullifierHash = poseidon([F.e(nullifier.toString())]);
  const nullifierHashStr = F.toString(nullifierHash);

  console.log("=== Test commitment generated ===");
  console.log("nullifier:", nullifier.toString());
  console.log("secret:", secret.toString());
  console.log("commitment:", commitmentStr);
  console.log("nullifierHash:", nullifierHashStr);

  // Build a simple merkle tree with our single commitment
  const LEVELS = 20;
  const ZERO_VALUE = "21663839004416932945382355908790599225266501822907911457504978515578255421292";

  // Pre-compute zeros
  const zeros = [F.e(ZERO_VALUE)];
  for (let i = 1; i < LEVELS; i++) {
    zeros.push(poseidon([zeros[i-1], zeros[i-1]]));
  }

  // Insert commitment at index 0 and compute root
  const pathElements = [];
  const pathIndices = [];
  let currentLevelHash = commitment;
  let currentIndex = 0;

  for (let i = 0; i < LEVELS; i++) {
    if (currentIndex % 2 === 0) {
      pathElements.push(F.toString(zeros[i]));
      pathIndices.push(0);
      currentLevelHash = poseidon([currentLevelHash, zeros[i]]);
    } else {
      pathElements.push(F.toString(zeros[i])); // Should be filled subtree, but at index 0 all left siblings are zeros
      pathIndices.push(1);
      currentLevelHash = poseidon([zeros[i], currentLevelHash]);
    }
    currentIndex = Math.floor(currentIndex / 2);
  }

  const root = F.toString(currentLevelHash);
  console.log("root:", root);

  // Generate witness and proof
  const input = {
    // Public inputs
    root: root,
    nullifierHash: nullifierHashStr,
    recipient: "0x000000000000000000000000000000000000dEaD",  // dead address for test
    relayer: "0x0000000000000000000000000000000000000001",
    fee: "0",
    refund: "0",
    // Private inputs
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    pathElements: pathElements,
    pathIndices: pathIndices
  };

  console.log("\n=== Generating proof... ===");
  const startTime = Date.now();

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(__dirname, '..', 'circuits', 'build', 'withdraw_js', 'withdraw.wasm'),
    path.join(__dirname, '..', 'circuits', 'build', 'withdraw_final.zkey')
  );

  console.log("Proof generated in", Date.now() - startTime, "ms");
  console.log("\n=== Proof ===");
  console.log(JSON.stringify(proof, null, 2));
  console.log("\n=== Public signals ===");
  console.log(JSON.stringify(publicSignals, null, 2));

  // Save to file for testing
  fs.writeFileSync(
    path.join(__dirname, '..', 'circuits', 'build', 'test-proof.json'),
    JSON.stringify({ proof, publicSignals, input }, null, 2)
  );

  // Verify proof off-chain
  const vKey = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'circuits', 'build', 'verification_key.json')
  ));
  const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  console.log("\n=== Off-chain verification ===");
  console.log("Valid:", valid);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
