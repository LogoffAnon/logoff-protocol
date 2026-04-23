import { useState } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import { LOGOFF_CONFIG } from '../config';
import { getPoseidon } from './useZK';

export interface DepositResult {
  txHash: string;
  note: string;
  commitment: string;
}

export function useDeposit() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function deposit(denomination: string): Promise<DepositResult | null> {
    if (!walletClient || !publicClient) {
      setStatus('Please connect wallet');
      return null;
    }
    const poseidon = getPoseidon();
    if (!poseidon) {
      setStatus('ZK library not ready, try again');
      return null;
    }
    const F = poseidon.F;

    setLoading(true);
    try {
      setStatus('Generating commitment...');

      const randomBytes = (n: number) => {
        const arr = new Uint8Array(n);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      };

      const nullifier = BigInt('0x' + randomBytes(31));
      const secret = BigInt('0x' + randomBytes(31));
      const commitmentBn = poseidon([F.e(nullifier.toString()), F.e(secret.toString())]);
      const commitmentHex = ('0x' + F.toString(commitmentBn, 16).padStart(64, '0')) as `0x${string}`;

      const noteData = {
        network: 'sepolia',
        denomination,
        nullifier: nullifier.toString(),
        secret: secret.toString(),
        commitment: commitmentHex,
      };
      const note = `logoff-sepolia-${denomination}-${btoa(JSON.stringify(noteData))}`;

      setStatus('Confirm transaction in wallet...');

      const poolAddress = LOGOFF_CONFIG.contracts.pools[denomination as keyof typeof LOGOFF_CONFIG.contracts.pools] as `0x${string}`;

      const hash = await walletClient.writeContract({
        address: poolAddress,
        abi: [{
          name: 'deposit',
          type: 'function',
          stateMutability: 'payable',
          inputs: [{ name: '_commitment', type: 'bytes32' }],
          outputs: [],
        }],
        functionName: 'deposit',
        args: [commitmentHex],
        value: parseEther(denomination),
      });

      setStatus(`TX sent: ${hash.slice(0, 10)}... waiting for confirmation...`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      setStatus(`Deposit confirmed in block ${receipt.blockNumber}`);

      return { txHash: hash, note, commitment: commitmentHex };
    } catch (e: any) {
      console.error(e);
      setStatus('Error: ' + (e.shortMessage || e.message || String(e)));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { deposit, status, loading };
}
