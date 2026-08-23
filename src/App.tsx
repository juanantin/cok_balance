import { useCallback, useEffect, useState } from 'react'
import { AddWalletForm } from './components/AddWalletForm'
import { fetchWalletBalance, TOKEN_MINT } from './lib/solana'
import { loadWallets, makeWalletId, saveWallets } from './lib/wallets'
import type { Wallet, WalletBalance } from './types'

const EMPTY_BALANCE: WalletBalance = { sol: null, token: null, error: null, loading: false }

function formatAmount(value: number | null, digits = 4): string {
  if (value === null) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

function App() {
  const [wallets, setWallets] = useState<Wallet[]>(() => loadWallets())
  const [balances, setBalances] = useState<Record<string, WalletBalance>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    saveWallets(wallets)
  }, [wallets])

  const refreshWallet = useCallback(async (wallet: Wallet) => {
    setBalances((prev) => ({
      ...prev,
      [wallet.id]: { ...(prev[wallet.id] ?? EMPTY_BALANCE), loading: true },
    }))
    const result = await fetchWalletBalance(wallet.address)
    setBalances((prev) => ({
      ...prev,
      [wallet.id]: { ...result, loading: false },
    }))
  }, [])

  const refreshAll = useCallback(() => {
    wallets.forEach((wallet) => {
      refreshWallet(wallet)
    })
  }, [wallets, refreshWallet])

  useEffect(() => {
    wallets.forEach((wallet) => {
      if (!balances[wallet.id]) {
        refreshWallet(wallet)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets])

  function handleAddWallet(name: string, address: string) {
    const wallet: Wallet = { id: makeWalletId(), name, address }
    setWallets((prev) => [...prev, wallet])
    setShowAddForm(false)
  }

  function handleRemoveWallet(id: string) {
    setWallets((prev) => prev.filter((w) => w.id !== id))
    setBalances((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function handleCopy(id: string, address: string) {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedId(id)
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500)
    } catch {
      // clipboard unavailable, ignore
    }
  }

  const totals = wallets.reduce(
    (acc, wallet) => {
      const b = balances[wallet.id]
      if (b?.sol != null) {
        acc.sol += b.sol
        acc.hasSol = true
      }
      if (b?.token != null) {
        acc.token += b.token
        acc.hasToken = true
      }
      return acc
    },
    { sol: 0, token: 0, hasSol: false, hasToken: false }
  )

  const anyLoading = wallets.some((w) => balances[w.id]?.loading)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Wallet Balances</h1>
          <p className="subtitle">
            SOL and token balances for{' '}
            <a
              href={`https://solscan.io/token/${TOKEN_MINT}`}
              target="_blank"
              rel="noreferrer"
              className="mint-link"
            >
              {shortenAddress(TOKEN_MINT)}
            </a>
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={refreshAll} disabled={anyLoading}>
            {anyLoading ? 'Refreshing…' : 'Refresh all'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            + Add wallet
          </button>
        </div>
      </header>

      {showAddForm && (
        <div className="modal-backdrop" onClick={() => setShowAddForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add wallet</h2>
            <AddWalletForm
              onAdd={handleAddWallet}
              onCancel={() => setShowAddForm(false)}
              existingAddresses={wallets.map((w) => w.address)}
            />
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="wallet-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th className="num">SOL</th>
              <th className="num">Token</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {wallets.map((wallet) => {
              const balance = balances[wallet.id] ?? EMPTY_BALANCE
              return (
                <tr key={wallet.id}>
                  <td className="name-cell">{wallet.name}</td>
                  <td className="address-cell">
                    <button className="address-btn" onClick={() => handleCopy(wallet.id, wallet.address)}>
                      {shortenAddress(wallet.address)}
                    </button>
                    {copiedId === wallet.id && <span className="copied-tag">Copied</span>}
                  </td>
                  <td className="num">
                    {balance.loading ? <span className="spinner" /> : formatAmount(balance.sol)}
                  </td>
                  <td className="num">
                    {balance.loading ? <span className="spinner" /> : formatAmount(balance.token, 2)}
                  </td>
                  <td className="row-actions">
                    <button
                      className="icon-btn"
                      title="Refresh"
                      onClick={() => refreshWallet(wallet)}
                      disabled={balance.loading}
                    >
                      ↻
                    </button>
                    <button className="icon-btn danger" title="Remove" onClick={() => handleRemoveWallet(wallet.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num">{formatAmount(totals.hasSol ? totals.sol : null)}</td>
              <td className="num">{formatAmount(totals.hasToken ? totals.token : null, 2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {wallets.some((w) => balances[w.id]?.error) && (
        <div className="errors">
          {wallets
            .filter((w) => balances[w.id]?.error)
            .map((w) => (
              <p key={w.id} className="error-line">
                {w.name}: {balances[w.id]?.error}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

export default App
