// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LogOff.sol";
import "../src/IHasher.sol";
import "../src/IVerifier.sol";
import "./mocks/MockVerifier.sol";

contract LogOffIntegrationTest is Test {
    LogOff public logoff;
    IHasher public poseidon;
    MockVerifier public verifier;

    uint256 public constant DENOMINATION = 0.1 ether;
    uint32 public constant LEVELS = 20;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address relayer = makeAddr("relayer");

    function setUp() public {
        // Deploy real Poseidon from bytecode
        string memory json = vm.readFile("poseidon-artifact/PoseidonT3.json");
        bytes memory bytecode = vm.parseJsonBytes(json, ".bytecode");

        address deployed;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(deployed) { revert(0, 0) }
        }
        poseidon = IHasher(deployed);
        verifier = new MockVerifier();

        logoff = new LogOff(
            IVerifier(address(verifier)),
            poseidon,
            DENOMINATION,
            LEVELS
        );

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _field(bytes memory data) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(data)) % FIELD_SIZE);
    }

    function test_EmptyTreeRoot() public view {
        // The initial root of an empty tree = zeros[LEVELS-1]
        bytes32 root = logoff.getLastRoot();
        bytes32 expected = logoff.zeros(LEVELS - 1);
        assertEq(root, expected);
    }

    function test_DepositWithRealPoseidon() public {
        bytes32 commitment = _field("test-commitment-1");

        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(commitment);

        // Root should have changed after deposit
        bytes32 root = logoff.getLastRoot();
        bytes32 emptyRoot = logoff.zeros(LEVELS - 1);
        assertTrue(root != emptyRoot, "Root should change after deposit");
        assertEq(logoff.nextIndex(), 1);

        emit log_named_bytes32("Root after 1 deposit", root);
    }

    function test_MultipleDepositsRoots() public {
        bytes32[] memory roots = new bytes32[](5);

        for (uint i = 0; i < 5; i++) {
            bytes32 commitment = _field(abi.encodePacked("commitment-", i));
            vm.prank(alice);
            logoff.deposit{value: DENOMINATION}(commitment);
            roots[i] = logoff.getLastRoot();
            emit log_named_uint("Deposit index", i);
            emit log_named_bytes32("New root", roots[i]);
        }

        // All roots should be different
        for (uint i = 0; i < 5; i++) {
            for (uint j = i+1; j < 5; j++) {
                assertTrue(roots[i] != roots[j], "Roots should all be unique");
            }
        }
    }

    function test_FullDepositWithdrawFlow() public {
        bytes32 commitment = _field("my-secret-commitment");

        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(commitment);

        bytes32 root = logoff.getLastRoot();
        bytes32 nullifierHash = _field("my-secret-nullifier");
        uint256 fee = 0.005 ether;

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        uint256 bobBefore = bob.balance;
        uint256 relayerBefore = relayer.balance;

        logoff.withdraw(
            pA, pB, pC,
            root,
            nullifierHash,
            payable(bob),
            payable(relayer),
            fee,
            0
        );

        assertEq(bob.balance, bobBefore + DENOMINATION - fee);
        assertEq(relayer.balance, relayerBefore + fee);
        assertEq(logoff.nullifierHashes(nullifierHash), true);
        assertEq(address(logoff).balance, 0);
    }
}
