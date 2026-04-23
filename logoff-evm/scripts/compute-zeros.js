const { buildPoseidon } = require('circomlibjs');

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Zero value inicial - keccak256("LogOff") truncado ao field size BN254
  // Usar um valor determinístico e conhecido
  const ZERO_VALUE_STR = "21663839004416932945382355908790599225266501822907911457504978515578255421292";

  let current = F.e(ZERO_VALUE_STR);
  const zeros = [F.toString(current)];

  console.log("// LogOff - Pre-computed Poseidon zero hashes for Merkle tree");
  console.log("// ZERO_VALUE = keccak256('LogOff') % FIELD_SIZE");
  console.log("// Each level's zero = Poseidon(previous_zero, previous_zero)");
  console.log("");
  console.log("function zeros(uint256 i) public pure returns (bytes32) {");
  console.log(`    if (i == 0) return bytes32(uint256(${F.toString(current)})); // ZERO_VALUE`);

  for (let i = 1; i < 20; i++) {
    current = poseidon([current, current]);
    const val = F.toString(current);
    zeros.push(val);
    console.log(`    if (i == ${i}) return bytes32(uint256(${val}));`);
  }
  console.log('    revert("Index out of bounds");');
  console.log("}");
  console.log("");
  console.log("// All zeros computed:");
  zeros.forEach((z, i) => console.log(`// Level ${i}: ${z}`));
}

main().catch(console.error);
