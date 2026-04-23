<h1 align="center">LogOff</h1>
<p align="center">
  <strong>Zero-Knowledge Privacy Protocol on Ethereum</strong>
</p>

<p align="center">
  <a href="https://logoff-evm.onrender.com">Live app</a> ·
  <a href="https://x.com/LogoffAnon">Twitter</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Ethereum-Sepolia-627EEA?logo=ethereum&logoColor=white" alt="Ethereum Sepolia">
  <img src="https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity" alt="Solidity">
  <img src="https://img.shields.io/badge/Circom-2.2-blueviolet" alt="Circom">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

---

LogOff lets you deposit ETH into a shielded pool and withdraw it later from any address, breaking the on-chain link between sender and receiver. Your deposit becomes one among many; your withdrawal reveals nothing about who deposited.

No KYC. No accounts. No logs. Just zero-knowledge proofs.

## How it works

1. **Deposit** ETH into a fixed-denomination pool. A cryptographic commitment joins the on-chain Merkle tree.
2. **Shield.** Funds rest in the pool. You hold a secret note that proves ownership without revealing which deposit is yours.
3. **Withdraw** to any fresh address. The contract verifies a Groth16 proof and releases the funds.

## Stack

- **Contracts** — Solidity 0.8.20, Foundry, OpenZeppelin
- **ZK circuit** — Circom 2.2 + snarkjs, Groth16 over BN254
- **Hashing** — Poseidon (SNARK-optimized)
- **Frontend** — React + Vite + RainbowKit + wagmi + viem
- **Hosting** — Render (static site + build pipeline)

## Specifications

| | |
|---|---|
| Proof system | Groth16 |
| Elliptic curve | BN254 |
| Merkle depth | 20 (up to ~1M deposits per pool) |
| Root history | 30 |
| Denominations | 0.01, 0.1, 1 ETH |
| Relayer fee | 0.15% |

## Deployed contracts (Sepolia)

| Contract | Address |
|---|---|
| Poseidon | `0x4B052e65B9a4431EC115C6EcAc086Fe74758fcF6` |
| Groth16 Verifier | `0xfF0588e6eE5F969F2440becB3815E71f53479F30` |
| Pool — 0.01 ETH | `0x003230A7d131AB491cdFe1A9a162D7FCB738df04` |
| Pool — 0.1 ETH | `0x188DE1761C23a6387045276246De01ddd1217ccC` |
| Pool — 1 ETH | `0xaC319bBEd82A3349cC7f8adB0c980A68aeed8bAA` |

## Repository layout

```
.
├── app-evm/          # HTML landing page (served at /)
├── app-evm-react/    # React dApp (served at /app)
├── logoff-evm/       # Foundry contracts + Circom circuits + trusted setup
├── render.yaml       # Render build + routes
└── CNAME             # Custom domain
```

## Local development

Contracts:

```bash
cd logoff-evm
forge install
forge test
```

Frontend:

```bash
cd app-evm-react
npm install
npm run dev
```

## Disclaimer

LogOff is experimental cryptographic software deployed on a public testnet. Contracts are unaudited. All transactions are final and irreversible. Use at your own risk.

## License

MIT
