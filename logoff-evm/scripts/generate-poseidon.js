const { poseidonContract } = require('circomlibjs');
const fs = require('fs');
const path = require('path');

async function main() {
  // Generate Poseidon hasher contract for 2 inputs
  const bytecode = poseidonContract.createCode(2);
  const abi = poseidonContract.generateABI(2);

  const output = {
    abi: abi,
    bytecode: bytecode
  };

  // Save to JSON
  const outputDir = path.join(__dirname, '..', 'poseidon-artifact');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(outputDir, 'PoseidonT3.json'),
    JSON.stringify(output, null, 2)
  );

  console.log("Poseidon contract generated:");
  console.log("ABI:", JSON.stringify(abi, null, 2));
  console.log("Bytecode length:", bytecode.length, "chars");
  console.log("Saved to: poseidon-artifact/PoseidonT3.json");
}

main().catch(console.error);
