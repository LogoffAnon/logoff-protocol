// LogOff EVM dApp Configuration
window.LOGOFF_CONFIG = {
  network: {
    name: "Sepolia",
    chainId: 11155111,
    chainIdHex: "0xaa36a7",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io"
  },
  contracts: {
    poseidon: "0x4B052e65B9a4431EC115C6EcAc086Fe74758fcF6",
    verifier: "0xfF0588e6eE5F969F2440becB3815E71f53479F30",
    pools: {
      "0.01": "0x003230A7d131AB491cdFe1A9a162D7FCB738df04",
      "0.1": "0x188DE1761C23a6387045276246De01ddd1217ccC",
      "1": "0xaC319bBEd82A3349cC7f8adB0c980A68aeed8bAA"
    }
  },
  merkle: {
    levels: 20,
    fieldSize: "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    zeroValue: "21663839004416932945382355908790599225266501822907911457504978515578255421292"
  }
};
