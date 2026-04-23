// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LogOff.sol";
import "../src/IHasher.sol";
import "../src/IVerifier.sol";
import "./mocks/MockHasher.sol";
import "./mocks/MockVerifier.sol";

contract LogOffTest is Test {
    LogOff public logoff;
    MockHasher public hasher;
    MockVerifier public verifier;

    uint256 public constant DENOMINATION = 0.1 ether;
    uint32 public constant LEVELS = 20;

    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address relayer = makeAddr("relayer");

    function _field(bytes memory data) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(data)) % FIELD_SIZE);
    }

    function setUp() public {
        hasher = new MockHasher();
        verifier = new MockVerifier();
        logoff = new LogOff(
            IVerifier(address(verifier)),
            IHasher(address(hasher)),
            DENOMINATION,
            LEVELS
        );

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function test_DeploymentState() public view {
        assertEq(logoff.denomination(), DENOMINATION);
        assertEq(logoff.levels(), LEVELS);
        assertEq(logoff.nextIndex(), 0);
        assertEq(address(logoff.verifier()), address(verifier));
        assertEq(address(logoff.hasher()), address(hasher));
    }

    function test_Deposit_Success() public {
        bytes32 commitment = _field("commitment-1");

        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(commitment);

        assertEq(logoff.nextIndex(), 1);
        assertEq(logoff.commitments(commitment), true);
        assertEq(address(logoff).balance, DENOMINATION);
    }

    function test_Deposit_Fails_WrongAmount() public {
        bytes32 commitment = _field("commitment-1");

        vm.prank(alice);
        vm.expectRevert("Please send exact denomination");
        logoff.deposit{value: 0.05 ether}(commitment);
    }

    function test_Deposit_Fails_DuplicateCommitment() public {
        bytes32 commitment = _field("commitment-1");

        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(commitment);

        vm.prank(bob);
        vm.expectRevert("The commitment has been submitted");
        logoff.deposit{value: DENOMINATION}(commitment);
    }

    function test_MultipleDeposits() public {
        for (uint i = 0; i < 5; i++) {
            bytes32 commitment = _field(abi.encodePacked("commitment-", i));
            vm.prank(alice);
            logoff.deposit{value: DENOMINATION}(commitment);
        }

        assertEq(logoff.nextIndex(), 5);
        assertEq(address(logoff).balance, DENOMINATION * 5);
    }

    function test_Withdraw_Success() public {
        // Setup: deposit first to have funds and a valid root
        bytes32 commitment = _field("commitment-1");
        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(commitment);

        bytes32 root = logoff.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");
        uint256 fee = 0.01 ether;

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        uint256 bobBalanceBefore = bob.balance;
        uint256 relayerBalanceBefore = relayer.balance;

        logoff.withdraw(
            pA, pB, pC,
            root,
            nullifierHash,
            payable(bob),
            payable(relayer),
            fee,
            0
        );

        assertEq(bob.balance, bobBalanceBefore + DENOMINATION - fee);
        assertEq(relayer.balance, relayerBalanceBefore + fee);
        assertEq(logoff.nullifierHashes(nullifierHash), true);
    }

    function test_Withdraw_Fails_DoubleSpend() public {
        bytes32 commitment = _field("commitment-1");
        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(commitment);

        bytes32 root = logoff.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        logoff.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, 0);

        vm.expectRevert("The note has been already spent");
        logoff.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, 0);
    }

    function test_Withdraw_Fails_InvalidRoot() public {
        bytes32 fakeRoot = _field("fake-root");
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        vm.expectRevert("Cannot find your merkle root");
        logoff.withdraw(pA, pB, pC, fakeRoot, nullifierHash, payable(bob), payable(relayer), 0, 0);
    }

    function test_Withdraw_Fails_InvalidProof() public {
        bytes32 commitment = _field("commitment-1");
        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(commitment);

        verifier.setShouldVerify(false);

        bytes32 root = logoff.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        vm.expectRevert("Invalid withdraw proof");
        logoff.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, 0);
    }

    function test_Withdraw_Fails_FeeExceedsDenomination() public {
        bytes32 commitment = _field("commitment-1");
        vm.prank(alice);
        logoff.deposit{value: DENOMINATION}(commitment);

        bytes32 root = logoff.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        vm.expectRevert("Fee exceeds transfer value");
        logoff.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), DENOMINATION + 1, 0);
    }
}
