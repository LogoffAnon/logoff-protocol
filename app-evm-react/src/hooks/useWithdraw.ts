import { useState } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { isAddress, parseAbiItem } from 'viem';
import { LOGOFF_CONFIG } from '../config';
import { getPoseidon } from './useZK';
// @ts-expect-error snarkjs has no types
import * as snarkjs from 'snarkjs';

export function useWithdraw() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function withdraw(noteString: string, recipient: string): Promise<string | null> {
    if (!walletClient || !publicClient) { setStatus('Connect wallet'); return null; }
    const poseidon = getPoseidon();
    if (!poseidon) { setStatus('ZK not ready'); return null; }
    const F = poseidon.F;

    setLoading(true);
    try {
      if (!noteString.startsWith('logoff-sepolia-')) throw new Error('Invalid note');
      if (!isAddress(recipient)) throw new Error('Invalid recipient');

      const parts = noteString.split('-');
      const denom = parts[2];
      const encoded = parts.slice(3).join('-');
      const noteData = JSON.parse(atob(encoded));

      const poolAddress = LOGOFF_CONFIG.contracts.pools[denom as keyof typeof LOGOFF_CONFIG.contracts.pools] as `0x${string}`;
      if (!poolAddress) throw new Error('Unknown denomination: ' + denom);

      setStatus('Fetching Merkle tree state...');

      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock - 49000n > 0n ? currentBlock - 49000n : 0n;

      const logs = await publicClient.getLogs({
        address: poolAddress,
        event: parseAbiItem('event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)'),
        fromBlock,
        toBlock: 'latest',
      });

      const leaves = logs.map(l => BigInt(l.args.commitment as string));
      const leafIndex = leaves.findIndex(l => l === BigInt(noteData.commitment));
      if (leafIndex === -1) throw new Error('Commitment not found on chain');

      setStatus('Building Merkle path...');

      const LEVELS = LOGOFF_CONFIG.merkle.levels;
      const zeros: bigint[] = [];
      for (let i = 0; i < LEVELS; i++) {
        const z = await publicClient.readContract({
          address: poolAddress,
          abi: [{ name: 'zeros', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bytes32' }] }],
          functionName: 'zeros',
          args: [BigInt(i)],
        });
        zeros.push(BigInt(z as string));
      }

      const pathElements: string[] = [];
      const pathIndices: number[] = [];
      let currentIndex = leafIndex;
      let currentLevel = [...leaves];

      for (let i = 0; i < LEVELS; i++) {
        const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
        const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : zeros[i];
        pathElements.push(F.toString(F.e(sibling.toString())));
        pathIndices.push(currentIndex % 2);

        const nextLevel: bigint[] = [];
        for (let j = 0; j < currentLevel.length; j += 2) {
          const left = j < currentLevel.length ? currentLevel[j] : zeros[i];
          const right = (j + 1) < currentLevel.length ? currentLevel[j + 1] : zeros[i];
          const parent = poseidon([F.e(left.toString()), F.e(right.toString())]);
          nextLevel.push(BigInt(F.toString(parent)));
        }
        currentLevel = nextLevel;
        currentIndex = Math.floor(currentIndex / 2);
        if (currentLevel.length === 0) currentLevel = [zeros[i + 1] || 0n];
      }

      const root = await publicClient.readContract({
        address: poolAddress,
        abi: [{ name: 'getLastRoot', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] }],
        functionName: 'getLastRoot',
      }) as string;

      const nullifierHashBn = poseidon([F.e(noteData.nullifier)]);
      const nullifierHashHex = ('0x' + F.toString(nullifierHashBn, 16).padStart(64, '0')) as `0x${string}`;

      const spent = await publicClient.readContract({
        address: poolAddress,
        abi: [{ name: 'nullifierHashes', type: 'function', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'bool' }] }],
        functionName: 'nullifierHashes',
        args: [nullifierHashHex],
      });
      if (spent) throw new Error('Note already spent');

      setStatus('Generating ZK proof (5-15s)...');

      const input = {
        root: BigInt(root).toString(),
        nullifierHash: F.toString(nullifierHashBn),
        recipient: BigInt(recipient).toString(),
        relayer: '0',
        fee: '0',
        refund: '0',
        nullifier: noteData.nullifier,
        secret: noteData.secret,
        pathElements,
        pathIndices,
      };

      const { proof } = await snarkjs.groth16.fullProve(input, '/circuits/withdraw.wasm', '/circuits/withdraw_final.zkey');

      setStatus('Confirm withdraw in wallet...');

      const pA = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint];
      const pB = [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
      ] as [[bigint, bigint], [bigint, bigint]];
      const pC = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint];

      const hash = await walletClient.writeContract({
        address: poolAddress,
        abi: [{
          name: 'withdraw',
          type: 'function',
          stateMutability: 'payable',
          inputs: [
            { name: '_pA', type: 'uint256[2]' },
            { name: '_pB', type: 'uint256[2][2]' },
            { name: '_pC', type: 'uint256[2]' },
            { name: '_root', type: 'bytes32' },
            { name: '_nullifierHash', type: 'bytes32' },
            { name: '_recipient', type: 'address' },
            { name: '_relayer', type: 'address' },
            { name: '_fee', type: 'uint256' },
            { name: '_refund', type: 'uint256' },
          ],
          outputs: [],
        }],
        functionName: 'withdraw',
        args: [pA, pB, pC, root as `0x${string}`, nullifierHashHex, recipient as `0x${string}`, '0x0000000000000000000000000000000000000000', 0n, 0n],
      });

      setStatus(`TX sent: ${hash.slice(0, 10)}... waiting...`);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus('Withdraw confirmed!');

      return hash;
    } catch (e: any) {
      console.error(e);
      setStatus('Error: ' + (e.shortMessage || e.message || String(e)));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { withdraw, status, loading };
}
