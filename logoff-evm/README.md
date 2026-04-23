# LogOff EVM

Zero-knowledge privacy protocol implementation for Ethereum and EVM-compatible chains.

## Sepolia Deployment

| Contract | Address |
|:---|:---|
| Poseidon Hasher | [`0x4B052e65B9a4431EC115C6EcAc086Fe74758fcF6`](https://sepolia.etherscan.io/address/0x4B052e65B9a4431EC115C6EcAc086Fe74758fcF6) |
| Groth16 Verifier | [`0xfF0588e6eE5F969F2440becB3815E71f53479F30`](https://sepolia.etherscan.io/address/0xfF0588e6eE5F969F2440becB3815E71f53479F30) |
| Pool 0.01 ETH | [`0x003230A7d131AB491cdFe1A9a162D7FCB738df04`](https://sepolia.etherscan.io/address/0x003230A7d131AB491cdFe1A9a162D7FCB738df04) |
| Pool 0.1 ETH | [`0x188DE1761C23a6387045276246De01ddd1217ccC`](https://sepolia.etherscan.io/address/0x188DE1761C23a6387045276246De01ddd1217ccC) |
| Pool 1 ETH | [`0xaC319bBEd82A3349cC7f8adB0c980A68aeed8bAA`](https://sepolia.etherscan.io/address/0xaC319bBEd82A3349cC7f8adB0c980A68aeed8bAA) |

## Architecture

### Contracts

- **`LogOff.sol`** - Main pool contract. Handles deposits (fixed denomination) and withdrawals (with ZK proof verification).
- **`MerkleTreeWithHistory.sol`** - Incremental Merkle tree (depth 20, Poseidon hash) with 30-root history buffer.
- **`Verifier.sol`** - Groth16 proof verifier auto-generated from the Circom circuit.
- **`IHasher.sol`** - Interface to the Poseidon hash contract.
- **`IVerifier.sol`** - Interface to the Groth16 verifier.

### Circuits

- **`withdraw.circom`** - Main ZK circuit. Proves knowledge of `(nullifier, secret)` such that `Poseidon(nullifier, secret)` is in the Merkle tree, without revealing which commitment.
- **`merkleTree.circom`** - Merkle inclusion proof circuit with Poseidon hashing.

### Proof System

- **Protocol:** Groth16 zkSNARKs
- **Curve:** BN254 (alt_bn128)
- **Constraints:** ~11,336 (5,383 non-linear + 5,953 linear)
- **Proof generation:** ~1 second (client-side)
- **On-chain verification:** ~300K gas

## Development

### Requirements

- Foundry (forge + cast)
- Node.js 18+
- Circom 2.2+
- snarkjs 0.7+

### Setup

```bash
# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
npm install

# Compile contracts
forge build

# Run tests
forge test -vv
```

### Circuit compilation

```bash
cd circuits
circom withdraw.circom --r1cs --wasm --sym -o build/

# Trusted setup (download Powers of Tau)
cd build
curl -o pot14_final.ptau https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau

# Phase 2
snarkjs groth16 setup withdraw.r1cs pot14_final.ptau withdraw_0000.zkey
snarkjs zkey contribute withdraw_0000.zkey withdraw_final.zkey -v
snarkjs zkey export solidityverifier withdraw_final.zkey ../../src/Verifier.sol
```

### Deployment

```bash
# Create .env from .env.example with your PRIVATE_KEY and RPC
cp .env.example .env

# Deploy to Sepolia
source .env
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

## Test Suite

18+ tests covering:
- Deployment state validation
- Deposit success, wrong amount rejection, duplicate commitment rejection
- Multi-deposit Merkle tree behavior
- Withdrawal with real ZK proof verification
- Double-spend protection (nullifier registry)
- Invalid root rejection
- Invalid proof rejection
- Fee cap enforcement
- Poseidon hash matches circomlibjs test vectors
- Full end-to-end integration (Poseidon + Merkle + Verifier + real proof)

## Security

- Nullifier registry prevents double-spending
- Merkle root history (30 roots) prevents stale proof usage
- Groth16 verification binds recipient, relayer, fee to the proof
- Non-custodial: no admin keys for deposited funds

## Notes

This is a testnet deployment. For mainnet:
- A proper trusted setup ceremony with multiple contributors is required
- Security audit recommended
- Powers of Tau used is from Hermez (standard, public)
