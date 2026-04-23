// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Verifier.sol";

contract VerifierRealTest is Test {
    Groth16Verifier public verifier;

    function setUp() public {
        verifier = new Groth16Verifier();
    }

    function test_VerifyRealProof() public {
        string memory json = vm.readFile("circuits/build/test-proof.json");

        // Parse proof.pi_a
        uint256[2] memory pA;
        pA[0] = vm.parseJsonUint(json, ".proof.pi_a[0]");
        pA[1] = vm.parseJsonUint(json, ".proof.pi_a[1]");

        // Parse proof.pi_b (note: pi_b in snarkjs is 3x2, we take first 2x2 in reversed order per BN254 convention)
        uint256[2][2] memory pB;
        pB[0][0] = vm.parseJsonUint(json, ".proof.pi_b[0][1]");  // note: swapped
        pB[0][1] = vm.parseJsonUint(json, ".proof.pi_b[0][0]");
        pB[1][0] = vm.parseJsonUint(json, ".proof.pi_b[1][1]");
        pB[1][1] = vm.parseJsonUint(json, ".proof.pi_b[1][0]");

        // Parse proof.pi_c
        uint256[2] memory pC;
        pC[0] = vm.parseJsonUint(json, ".proof.pi_c[0]");
        pC[1] = vm.parseJsonUint(json, ".proof.pi_c[1]");

        // Parse publicSignals
        uint256[6] memory pubSignals;
        pubSignals[0] = vm.parseJsonUint(json, ".publicSignals[0]");
        pubSignals[1] = vm.parseJsonUint(json, ".publicSignals[1]");
        pubSignals[2] = vm.parseJsonUint(json, ".publicSignals[2]");
        pubSignals[3] = vm.parseJsonUint(json, ".publicSignals[3]");
        pubSignals[4] = vm.parseJsonUint(json, ".publicSignals[4]");
        pubSignals[5] = vm.parseJsonUint(json, ".publicSignals[5]");

        bool valid = verifier.verifyProof(pA, pB, pC, pubSignals);

        emit log_named_uint("Root", pubSignals[0]);
        emit log_named_uint("NullifierHash", pubSignals[1]);
        emit log_named_uint("Recipient", pubSignals[2]);

        assertTrue(valid, "Proof should be valid");
    }

    function test_RejectInvalidProof() public {
        string memory json = vm.readFile("circuits/build/test-proof.json");

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

        // Tamper with publicSignals (change root)
        uint256[6] memory pubSignals;
        pubSignals[0] = 12345;  // INVALID ROOT
        pubSignals[1] = vm.parseJsonUint(json, ".publicSignals[1]");
        pubSignals[2] = vm.parseJsonUint(json, ".publicSignals[2]");
        pubSignals[3] = vm.parseJsonUint(json, ".publicSignals[3]");
        pubSignals[4] = vm.parseJsonUint(json, ".publicSignals[4]");
        pubSignals[5] = vm.parseJsonUint(json, ".publicSignals[5]");

        bool valid = verifier.verifyProof(pA, pB, pC, pubSignals);
        assertFalse(valid, "Tampered proof should be rejected");
    }
}
