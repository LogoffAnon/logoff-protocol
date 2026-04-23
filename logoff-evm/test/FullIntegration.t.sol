// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LogOff.sol";
import "../src/IHasher.sol";
import "../src/IVerifier.sol";
import "../src/Verifier.sol";

contract FullIntegrationTest is Test {
    LogOff public logoff;
    IHasher public poseidon;
    Groth16Verifier public verifier;

    uint256 public constant DENOMINATION = 0.1 ether;
    uint32 public constant LEVELS = 20;

    address alice = makeAddr("alice");
    // recipient is hardcoded in the proof as 0xdEaD
    address constant RECIPIENT = 0x000000000000000000000000000000000000dEaD;
    address constant RELAYER = 0x0000000000000000000000000000000000000001;

    function setUp() public {
        // Deploy real Poseidon
        string memory poseidonJson = vm.readFile("poseidon-artifact/PoseidonT3.json");
        bytes memory bytecode = vm.parseJsonBytes(poseidonJson, ".bytecode");
        address deployed;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(deployed) { revert(0, 0) }
        }
        poseidon = IHasher(deployed);

        // Deploy real Groth16 Verifier
        verifier = new Groth16Verifier();

        // Deploy LogOff with real verifier and hasher
        logoff = new LogOff(
            IVerifier(address(verifier)),
            poseidon,
            DENOMINATION,
            LEVELS
        );

        vm.deal(alice, 10 ether);
    }

    function test_FullFlowWithRealProof() public {
        string memory json = vm.readFile("circuits/build/test-proof.json");

        // Parse the nullifier and secret to compute commitment
        uint256 nullifier = vm.parseJsonUint(json, ".input.nullifier");
        uint256 secret = vm.parseJsonUint(json, ".input.secret");

        // Compute commitment on-chain with real Poseidon
        bytes32[2] memory hashInput;
        hashInput[0] = bytes32(nullifier);
        hashInput[1] = bytes32(secret);
        bytes32 computedCommitment = poseidon.poseidon(hashInput);

        emit log_named_bytes32("Computed commitment", computedCommitment);

        // Deposit with this commitment
        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(computedCommitment);

        emit log_named_uint("Next index after deposit", logoff.nextIndex());

        bytes32 onChainRoot = logoff.getLastRoot();
        uint256 expectedRoot = vm.parseJsonUint(json, ".publicSignals[0]");

        emit log_named_bytes32("On-chain root", onChainRoot);
        emit log_named_uint("Expected root (from proof)", expectedRoot);

        // Roots should match - this validates that our JS Merkle tree builder matches the on-chain one
        assertEq(uint256(onChainRoot), expectedRoot, "On-chain root should match proof's root");

        // Now execute the withdrawal with the real proof
        uint256[2] memory pA;
        pA[0] = vm.parseJsonUint(json, ".proof.pi_a[0]");
        pA[1] = vm.parseJsonUint(json, ".proof.pi_a[1]");

        uint256[2][2] memory pB;
        pB[0][0] = vm.parseJsonUint(json, ".proof.pi_b[0][1]");
        pB[0][1] = vm.parseJsonUint(json, ".proof.pi_b[0][0]");
        pB[1][0] = vm.parseJsonUint(json, ".proof.pi_b[1][1]");
        pB[1][1] = vm.parseJsonUint(json, ".proof.pi_b[1][0]");

        uint256[2] memory pC;
        pC[0] = vm.parseJsonUint(json, ".proof.pi_c[0]");
        pC[1] = vm.parseJsonUint(json, ".proof.pi_c[1]");

        uint256 nullifierHash = vm.parseJsonUint(json, ".publicSignals[1]");

        uint256 balanceBefore = RECIPIENT.balance;

        logoff.withdraw(
            pA, pB, pC,
            bytes32(expectedRoot),
            bytes32(nullifierHash),
            payable(RECIPIENT),
            payable(RELAYER),
            0, // fee
            0  // refund
        );

        assertEq(RECIPIENT.balance, balanceBefore + DENOMINATION, "Recipient should receive full denomination");
        assertEq(address(logoff).balance, 0, "Pool should be empty after withdraw");
        assertTrue(logoff.isSpent(bytes32(nullifierHash)), "Nullifier should be marked as spent");

        emit log_string("FULL END-TO-END SUCCESS!");
    }
}
