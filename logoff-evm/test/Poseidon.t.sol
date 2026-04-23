// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/IHasher.sol";

contract PoseidonTest is Test {
    IHasher public poseidon;

    function setUp() public {
        string memory json = vm.readFile("poseidon-artifact/PoseidonT3.json");
        bytes memory bytecode = vm.parseJsonBytes(json, ".bytecode");

        address deployed;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(deployed) {
                revert(0, 0)
            }
        }
        require(deployed != address(0), "Poseidon deployment failed");
        poseidon = IHasher(deployed);
    }

    function test_PoseidonDeployed() public view {
        assertTrue(address(poseidon) != address(0));
    }

    function test_PoseidonMatchesTestVector_1_2() public {
        bytes32[2] memory inputs;
        inputs[0] = bytes32(uint256(1));
        inputs[1] = bytes32(uint256(2));
        bytes32 result = poseidon.poseidon(inputs);
        emit log_named_bytes32("poseidon(1,2)", result);
        // Expected: 7853200120776062878684798364095072458815029376092732009249414926327459813530
        assertEq(uint256(result), 7853200120776062878684798364095072458815029376092732009249414926327459813530);
    }

    function test_PoseidonMatchesTestVector_0_0() public {
        bytes32[2] memory inputs;
        inputs[0] = bytes32(uint256(0));
        inputs[1] = bytes32(uint256(0));
        bytes32 result = poseidon.poseidon(inputs);
        emit log_named_bytes32("poseidon(0,0)", result);
        // Expected: 14744269619966411208579211824598458697587494354926760081771325075741142829156
        assertEq(uint256(result), 14744269619966411208579211824598458697587494354926760081771325075741142829156);
    }
}
