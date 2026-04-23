export const LOGOFF_CONFIG = {
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
} as const;

export const POOL_ABI = [
  "function deposit(bytes32 _commitment) external payable",
  "function withdraw(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, bytes32 _root, bytes32 _nullifierHash, address _recipient, address _relayer, uint256 _fee, uint256 _refund) external payable",
  "function getLastRoot() external view returns (bytes32)",
  "function nextIndex() external view returns (uint32)",
  "function nullifierHashes(bytes32) external view returns (bool)",
  "function zeros(uint256) external view returns (bytes32)",
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)"
] as const;
