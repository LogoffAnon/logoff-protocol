const { buildPoseidon } = require('circomlibjs');

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const testCases = [
    ["1", "2"],
    ["0", "0"],
    ["123456789", "987654321"],
    ["21663839004416932945382355908790599225266501822907911457504978515578255421292", "0"],
  ];

  console.log("// Poseidon test vectors (from circomlibjs)");
  console.log("// Use these to verify on-chain Poseidon matches");
  console.log("");

  for (const [a, b] of testCases) {
    const result = poseidon([F.e(a), F.e(b)]);
    console.log(`// poseidon(${a}, ${b})`);
    console.log(`// = ${F.toString(result)}`);
    console.log("");
  }
}

main().catch(console.error);
