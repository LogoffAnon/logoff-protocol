// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LogOff.sol";
import "../src/Verifier.sol";
import "../src/IHasher.sol";
import "../src/IVerifier.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying from:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Poseidon hasher via bytecode
        string memory poseidonJson = vm.readFile("poseidon-artifact/PoseidonT3.json");
        bytes memory bytecode = vm.parseJsonBytes(poseidonJson, ".bytecode");
        address poseidonAddr;
        assembly {
            poseidonAddr := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(poseidonAddr) { revert(0, 0) }
        }
        console.log("Poseidon deployed at:", poseidonAddr);

        // 2. Deploy Groth16 Verifier
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Verifier deployed at:", address(verifier));

        // 3. Deploy LogOff pools (3 different denominations)
        LogOff pool01 = new LogOff(
            IVerifier(address(verifier)),
            IHasher(poseidonAddr),
            0.01 ether,
            20
        );
        console.log("LogOff 0.01 ETH pool deployed at:", address(pool01));

        LogOff pool1 = new LogOff(
            IVerifier(address(verifier)),
            IHasher(poseidonAddr),
            0.1 ether,
            20
        );
        console.log("LogOff 0.1 ETH pool deployed at:", address(pool1));

        LogOff pool10 = new LogOff(
            IVerifier(address(verifier)),
            IHasher(poseidonAddr),
            1 ether,
            20
        );
        console.log("LogOff 1 ETH pool deployed at:", address(pool10));

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("Poseidon:", poseidonAddr);
        console.log("Verifier:", address(verifier));
        console.log("Pool 0.01 ETH:", address(pool01));
        console.log("Pool 0.1 ETH:", address(pool1));
        console.log("Pool 1 ETH:", address(pool10));
    }
}
