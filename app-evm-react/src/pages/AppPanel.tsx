import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useZK } from '../hooks/useZK';
import { useDeposit } from '../hooks/useDeposit';
import { useWithdraw } from '../hooks/useWithdraw';
import { LOGOFF_CONFIG } from '../config';

const DENOMS = ['0.01', '0.1', '1'];

function AppPanel() {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [selectedDenom, setSelectedDenom] = useState('0.1');
  const [note, setNote] = useState('');
  const [depositTx, setDepositTx] = useState('');

  const [wNote, setWNote] = useState('');
  const [wRecipient, setWRecipient] = useState('');
  const [wTx, setWTx] = useState('');

  const zk = useZK();
  const { deposit, status: depStatus, loading: depLoading } = useDeposit();
  const { withdraw, status: wStatus, loading: wLoading } = useWithdraw();

  async function handleDeposit() {
    setNote('');
    setDepositTx('');
    const result = await deposit(selectedDenom);
    if (result) {
      setNote(result.note);
      setDepositTx(result.txHash);
    }
  }

  async function handleWithdraw() {
    setWTx('');
    const hash = await withdraw(wNote, wRecipient);
    if (hash) setWTx(hash);
  }

  function copyNote() {
    navigator.clipboard.writeText(note);
  }

  const recvAmt = (parseFloat(selectedDenom) * 0.9985).toFixed(Math.max(4, selectedDenom.split('.')[1]?.length || 2));

  return (
    <>
      <div className="devnet-banner">Running on Sepolia Testnet | Test tokens only</div>

      <nav style={{ top: 28 }}>
        <a href="/" className="logo">
          <div className="logo-toggle"></div>
          <span className="logo-text">LogOff</span>
        </a>
        <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />
      </nav>

      <section className="sec-cream" style={{ paddingTop: '7rem' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <span className="sec-label" style={{ justifyContent: 'center' }}>Shielded Transfers</span>
          <h2 className="sec-title">Time to <span className="italic">log off</span></h2>
          <p className="sec-desc" style={{ margin: '0 auto' }}>Connect your wallet. Deposit ETH. Get your secret note. Withdraw from any wallet.</p>
        </div>

        <div className="app-wrap">
          <div className="pool-bar">
            <div className="pool-bar-title">
              Pool Status <span style={{ background: 'var(--field)', color: 'white', fontSize: '.45rem', padding: '.1rem .4rem', marginLeft: '.4rem', letterSpacing: '1px', borderRadius: '3px' }}>SEPOLIA</span>
            </div>
            <div className="pool-row">
              {DENOMS.map(d => (
                <div key={d}>
                  <div className="pv">{d}</div>
                  <div className="pl">ETH Pool</div>
                </div>
              ))}
            </div>
          </div>

          <div className="app-box">
            <div className="app-tabs">
              <button className={`app-tab ${tab === 'deposit' ? 'active' : ''}`} onClick={() => setTab('deposit')}>Deposit</button>
              <button className={`app-tab ${tab === 'withdraw' ? 'active' : ''}`} onClick={() => setTab('withdraw')}>Withdraw</button>
            </div>

            <div className="app-body">
              {tab === 'deposit' && (
                <div className="app-panel active">
                  <div className="ig">
                    <label className="il">Amount (ETH)</label>
                    <input type="text" className="inp" value={selectedDenom} readOnly />
                    <div className="presets">
                      {DENOMS.map(d => (
                        <button
                          key={d}
                          className={`preset ${selectedDenom === d ? 'active' : ''}`}
                          onClick={() => setSelectedDenom(d)}
                        >{d} ETH</button>
                      ))}
                    </div>
                  </div>

                  <div className="ig" style={{ marginBottom: '.6rem' }}>
                    <div className="fr"><span className="fl">Protocol Fee</span><span className="fv">0.15%</span></div>
                    <div className="fr"><span className="fl">You Receive</span><span className="fv">~{recvAmt} ETH</span></div>
                  </div>

                  <button
                    className="btn-app"
                    onClick={handleDeposit}
                    disabled={depLoading || !zk.ready}
                  >
                    {depLoading ? 'Processing...' : !zk.ready ? 'Loading ZK...' : `Deposit ${selectedDenom} ETH`}
                  </button>

                  {note && (
                    <>
                      <div className="note-out show">{note}</div>
                      <div className="note-warn show">⚠ SAVE THIS NOTE. It is the only way to withdraw your funds.</div>
                      <button className="btn-app" style={{ marginTop: '.6rem', background: 'transparent', border: '1.5px solid var(--field)', color: 'var(--field)' }} onClick={copyNote}>Copy Note</button>
                    </>
                  )}

                  {depStatus && <div className="note-out show" style={{ fontStyle: 'normal', color: 'var(--ink-mid)' }}>{depStatus}</div>}
                  {depositTx && (
                    <div className="note-out show" style={{ fontStyle: 'normal' }}>
                      <a href={`${LOGOFF_CONFIG.network.explorerUrl}/tx/${depositTx}`} target="_blank" rel="noreferrer" style={{ color: 'var(--field)' }}>View on Etherscan &rarr;</a>
                    </div>
                  )}
                </div>
              )}

              {tab === 'withdraw' && (
                <div className="app-panel active">
                  <div className="ig">
                    <label className="il">Secret Note</label>
                    <input
                      type="text"
                      className="inp"
                      placeholder="logoff-sepolia-0.1-..."
                      value={wNote}
                      onChange={(e) => setWNote(e.target.value)}
                    />
                  </div>
                  <div className="ig">
                    <label className="il">Recipient Address</label>
                    <input
                      type="text"
                      className="inp"
                      placeholder="Ethereum wallet address (0x...)"
                      value={wRecipient}
                      onChange={(e) => setWRecipient(e.target.value)}
                    />
                  </div>
                  <div className="ig" style={{ marginBottom: 0 }}>
                    <div className="fr"><span className="fl">Status</span><span className="fv" style={{ color: 'var(--field)' }}>{wStatus || 'Ready'}</span></div>
                    <div className="fr"><span className="fl">Network</span><span className="fv">Sepolia</span></div>
                  </div>

                  <button
                    className="btn-app"
                    onClick={handleWithdraw}
                    disabled={wLoading || !zk.ready}
                  >
                    {wLoading ? 'Processing...' : !zk.ready ? 'Loading ZK...' : 'Generate Proof & Withdraw'}
                  </button>

                  {wTx && (
                    <div className="note-out show" style={{ fontStyle: 'normal' }}>
                      <a href={`${LOGOFF_CONFIG.network.explorerUrl}/tx/${wTx}`} target="_blank" rel="noreferrer" style={{ color: 'var(--field)' }}>View on Etherscan &rarr;</a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: '520px', margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 12, padding: '1.2rem', textAlign: 'center' }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: '1.4rem', color: 'var(--field)' }}>3</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.5rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Active Pools</div>
          </div>
          <div style={{ background: 'var(--cream)', border: '1px solid var(--cream-dark)', borderRadius: 12, padding: '1.2rem', textAlign: 'center' }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: '1.4rem', color: 'var(--field)' }}>0.15%</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.5rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Protocol Fee</div>
          </div>
        </div>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: '0.6rem', color: 'var(--ink-faint)', textAlign: 'center', lineHeight: 1.8, letterSpacing: '0.5px' }}>
          Deposits are fixed-denomination for maximum privacy.<br />
          Each pool maintains a separate anonymity set.<br />
          Withdrawals are processed directly via your wallet.
        </div>
      </div>

      <footer>
        <div className="footer-inner">
          <div className="footer-brand">
            <a href="/" className="logo" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
              <div className="logo-toggle"></div>
              <span className="logo-text">LogOff</span>
            </a>
          </div>
          <ul className="footer-links">
            <li><a href="https://x.com/LogoffAnon" target="_blank" rel="noreferrer">Twitter</a></li>
            <li><a href="https://github.com/LogoffAnon/logoff-protocol" target="_blank" rel="noreferrer">GitHub</a></li>
          </ul>
        </div>
        <p className="footer-copy">LogOff Protocol | Zero-Knowledge Privacy on Ethereum | All transactions are final and irreversible.<br />Use at your own risk. LogOff does not store any user data or private keys.</p>
      </footer>
    </>
  );
}

export default AppPanel;
