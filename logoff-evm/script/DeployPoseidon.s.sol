// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

contract DeployPoseidon is Script {
    function run() external returns (address deployed) {
        // Read bytecode from JSON artifact
        string memory json = vm.readFile("poseidon-artifact/PoseidonT3.json");
        bytes memory bytecode = vm.parseJsonBytes(json, ".bytecode");

        vm.startBroadcast();

        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(deployed) {
                revert(0, 0)
            }
        }

        vm.stopBroadcast();

        console.log("Poseidon deployed at:", deployed);
    }
}
