// LogOff dApp - EVM (Sepolia)

const POOL_ABI = [
  "function deposit(bytes32 _commitment) external payable",
  "function withdraw(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, bytes32 _root, bytes32 _nullifierHash, address _recipient, address _relayer, uint256 _fee, uint256 _refund) external payable",
  "function getLastRoot() external view returns (bytes32)",
  "function nextIndex() external view returns (uint32)",
  "function nullifierHashes(bytes32) external view returns (bool)",
  "function zeros(uint256) external view returns (bytes32)",
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)"
];

let provider, signer, userAddress;
let selectedDenom = "0.1";
let poseidon, F;

// Initialize Poseidon
async function initPoseidon() {
  if (!poseidon) {
    poseidon = await circomlibjs.buildPoseidon();
    F = poseidon.F;
  }
}

// UI helpers
function showStatus(elementId, message, type = "info") {
  const el = document.getElementById(elementId);
  el.innerHTML = `<div class="status ${type}">${message}</div>`;
}
function clearStatus(elementId) {
  document.getElementById(elementId).innerHTML = "";
}

// Tab switching
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab + "Panel").classList.add("active");
  });
});

// Pool selection
document.querySelectorAll(".pool-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pool-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedDenom = btn.dataset.denom;
  });
});

// Connect wallet
async function connectWallet() {
  if (!window.ethereum) {
    alert("Please install MetaMask");
    return;
  }

  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    // Check network
    const network = await provider.getNetwork();
    if (network.chainId !== BigInt(LOGOFF_CONFIG.network.chainId)) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: LOGOFF_CONFIG.network.chainIdHex }]
        });
        provider = new ethers.BrowserProvider(window.ethereum);
      } catch (e) {
        alert("Please switch to Sepolia network");
        return;
      }
    }

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    const btn = document.getElementById("connectBtn");
    btn.textContent = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
    btn.classList.add("connected");

    document.getElementById("depositBtn").disabled = false;
    document.getElementById("depositBtn").textContent = "Deposit";
    document.getElementById("withdrawBtn").disabled = false;
    document.getElementById("withdrawBtn").textContent = "Withdraw";

    await initPoseidon();
  } catch (e) {
    console.error(e);
    alert("Connection failed: " + e.message);
  }
}

document.getElementById("connectBtn").addEventListener("click", connectWallet);

// DEPOSIT
async function doDeposit() {
  if (!signer) { alert("Connect wallet first"); return; }

  const btn = document.getElementById("depositBtn");
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    clearStatus("depositStatus");
    document.getElementById("noteDisplay").classList.add("hidden");

    showStatus("depositStatus", "Generating commitment...", "info");

    // Generate random nullifier + secret (31 bytes each)
    const nullifier = ethers.toBigInt("0x" + Array.from(crypto.getRandomValues(new Uint8Array(31)))
      .map(b => b.toString(16).padStart(2, '0')).join(''));
    const secret = ethers.toBigInt("0x" + Array.from(crypto.getRandomValues(new Uint8Array(31)))
      .map(b => b.toString(16).padStart(2, '0')).join(''));

    // Compute commitment = Poseidon(nullifier, secret)
    const commitmentBn = poseidon([F.e(nullifier.toString()), F.e(secret.toString())]);
    const commitmentHex = "0x" + F.toString(commitmentBn, 16).padStart(64, '0');

    // Build note
    const noteData = {
      network: "sepolia",
      denomination: selectedDenom,
      nullifier: nullifier.toString(),
      secret: secret.toString(),
      commitment: commitmentHex
    };
    const noteString = "logoff-sepolia-" + selectedDenom + "-" + btoa(JSON.stringify(noteData));

    showStatus("depositStatus", "Please confirm transaction in MetaMask...", "info");

    const poolAddress = LOGOFF_CONFIG.contracts.pools[selectedDenom];
    const pool = new ethers.Contract(poolAddress, POOL_ABI, signer);

    const tx = await pool.deposit(commitmentHex, {
      value: ethers.parseEther(selectedDenom)
    });

    showStatus("depositStatus", `Transaction sent: ${tx.hash.slice(0, 10)}... Waiting for confirmation...`, "info");

    const receipt = await tx.wait();

    showStatus("depositStatus", `Deposit confirmed in block ${receipt.blockNumber}! <a href="${LOGOFF_CONFIG.network.explorerUrl}/tx/${tx.hash}" target="_blank" style="color:inherit;text-decoration:underline">View on Etherscan</a>`, "success");

    // Show the note
    document.getElementById("noteText").textContent = noteString;
    document.getElementById("noteDisplay").classList.remove("hidden");

    // Store note in memory for copy button
    window._currentNote = noteString;

  } catch (e) {
    console.error(e);
    showStatus("depositStatus", "Error: " + (e.reason || e.message), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Deposit";
  }
}

document.getElementById("depositBtn").addEventListener("click", doDeposit);

// Copy note
document.getElementById("copyNoteBtn").addEventListener("click", () => {
  if (window._currentNote) {
    navigator.clipboard.writeText(window._currentNote);
    const btn = document.getElementById("copyNoteBtn");
    btn.textContent = "Copied!";
    setTimeout(() => btn.textContent = "Copy Note", 2000);
  }
});

// WITHDRAW
async function doWithdraw() {
  if (!signer) { alert("Connect wallet first"); return; }

  const btn = document.getElementById("withdrawBtn");
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    clearStatus("withdrawStatus");

    const noteString = document.getElementById("noteInput").value.trim();
    const recipient = document.getElementById("recipientInput").value.trim();

    if (!noteString.startsWith("logoff-sepolia-")) {
      throw new Error("Invalid note format");
    }
    if (!ethers.isAddress(recipient)) {
      throw new Error("Invalid recipient address");
    }

    // Parse note
    const parts = noteString.split("-");
    const denom = parts[2];
    const encoded = parts.slice(3).join("-");
    const noteData = JSON.parse(atob(encoded));

    const poolAddress = LOGOFF_CONFIG.contracts.pools[denom];
    if (!poolAddress) throw new Error("Unknown denomination: " + denom);

    const pool = new ethers.Contract(poolAddress, POOL_ABI, signer);

    showStatus("withdrawStatus", "Fetching Merkle tree state...", "info");

    // Fetch all deposits from events
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 49000);
    const filter = pool.filters.Deposit();
    const events = await pool.queryFilter(filter, fromBlock, "latest");

    // Find our commitment in events
    const leaves = events.map(e => ethers.toBigInt(e.args.commitment));
    const leafIndex = leaves.findIndex(l => l === ethers.toBigInt(noteData.commitment));
    if (leafIndex === -1) throw new Error("Commitment not found in tree");

    showStatus("withdrawStatus", "Building Merkle path...", "info");

    // Get zeros from contract
    const LEVELS = LOGOFF_CONFIG.merkle.levels;
    const zeros = [];
    for (let i = 0; i < LEVELS; i++) {
      const z = await pool.zeros(i);
      zeros.push(ethers.toBigInt(z));
    }

    // Compute merkle path for our leaf
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
        const left = j < currentLevel.length ? currentLevel[j] : zeros[i];
        const right = (j + 1) < currentLevel.length ? currentLevel[j + 1] : zeros[i];
        const parent = poseidon([F.e(left.toString()), F.e(right.toString())]);
        nextLevel.push(ethers.toBigInt(F.toString(parent)));
      }
      currentLevel = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);

      if (currentLevel.length === 0) {
        currentLevel = [zeros[i + 1] || 0n];
      }
    }

    const root = await pool.getLastRoot();
    const nullifierHashBn = poseidon([F.e(noteData.nullifier)]);
    const nullifierHashHex = "0x" + F.toString(nullifierHashBn, 16).padStart(64, '0');

    // Check not already spent
    const spent = await pool.nullifierHashes(nullifierHashHex);
    if (spent) throw new Error("Note already spent");

    showStatus("withdrawStatus", "Generating ZK proof (this takes ~5-15 seconds)...", "info");

    const input = {
      root: ethers.toBigInt(root).toString(),
      nullifierHash: F.toString(nullifierHashBn),
      recipient: ethers.toBigInt(recipient).toString(),
      relayer: "0",
      fee: "0",
      refund: "0",
      nullifier: noteData.nullifier,
      secret: noteData.secret,
      pathElements: pathElements,
      pathIndices: pathIndices
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      "circuits/withdraw.wasm",
      "circuits/withdraw_final.zkey"
    );

    showStatus("withdrawStatus", "Please confirm withdrawal in MetaMask...", "info");

    const pA = [proof.pi_a[0], proof.pi_a[1]];
    const pB = [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]]
    ];
    const pC = [proof.pi_c[0], proof.pi_c[1]];

    const tx = await pool.withdraw(
      pA, pB, pC,
      root,
      nullifierHashHex,
      recipient,
      "0x0000000000000000000000000000000000000000",
      "0",
      "0"
    );

    showStatus("withdrawStatus", `Transaction sent: ${tx.hash.slice(0, 10)}... Waiting for confirmation...`, "info");
    const receipt = await tx.wait();

    showStatus("withdrawStatus", `Withdraw confirmed! ${denom} ETH sent to ${recipient.slice(0, 10)}... <a href="${LOGOFF_CONFIG.network.explorerUrl}/tx/${tx.hash}" target="_blank" style="color:inherit;text-decoration:underline">View on Etherscan</a>`, "success");

  } catch (e) {
    console.error(e);
    showStatus("withdrawStatus", "Error: " + (e.reason || e.message), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Withdraw";
  }
}

document.getElementById("withdrawBtn").addEventListener("click", doWithdraw);
