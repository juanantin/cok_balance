import { useCallback, useEffect, useState } from 'react'
import { AddWalletForm } from './components/AddWalletForm'
import { fetchTokenStats } from './lib/dexscreener'
import type { TokenStats } from './lib/dexscreener'
import { fetchAllBalances, fetchWalletBalance, TOKEN_MINT } from './lib/solana'
import { loadWallets, makeWalletId, saveWallets } from './lib/wallets'
import type { Wallet, WalletBalance } from './types'

const TOKEN_NAME = 'Cat Own Kimono'
const TOKEN_SYMBOL = 'COK'
const TOKEN_SUPPLY = 1_000_000_000_000

const EMPTY_BALANCE: WalletBalance = { sol: null, token: null, error: null, loading: false }

function formatAmount(value: number | null, digits = 4): string {
  if (value === null) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function formatSupplyShare(token: number | null): string {
  if (token === null) return '—'
  const share = (token / TOKEN_SUPPLY) * 100
  return `${share.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—'
  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPrice(value: number | null | undefined): string {
  if (value == null) return '—'
  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value)
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

function App() {
  const [wallets, setWallets] = useState<Wallet[]>(() => loadWallets())
  const [balances, setBalances] = useState<Record<string, WalletBalance>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null)
  const [tokenStatsError, setTokenStatsError] = useState<string | null>(null)
  const [tokenStatsLoading, setTokenStatsLoading] = useState(false)

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

  const refreshAllBalances = useCallback(async (walletsToRefresh: Wallet[]) => {
    if (walletsToRefresh.length === 0) return
    setBalances((prev) => {
      const next = { ...prev }
      walletsToRefresh.forEach((wallet) => {
        next[wallet.id] = { ...(next[wallet.id] ?? EMPTY_BALANCE), loading: true }
      })
      return next
    })
    const results = await fetchAllBalances(walletsToRefresh.map((w) => w.address))
    setBalances((prev) => {
      const next = { ...prev }
      walletsToRefresh.forEach((wallet) => {
        next[wallet.id] = { ...results[wallet.address], loading: false }
      })
      return next
    })
  }, [])

  const refreshTokenStats = useCallback(async () => {
    setTokenStatsLoading(true)
    setTokenStatsError(null)
    try {
      const stats = await fetchTokenStats(TOKEN_MINT)
      setTokenStats(stats)
    } catch (error) {
      setTokenStatsError(error instanceof Error ? error.message : String(error))
    } finally {
      setTokenStatsLoading(false)
    }
  }, [])

  const refreshAll = useCallback(() => {
    refreshAllBalances(wallets)
    refreshTokenStats()
  }, [wallets, refreshAllBalances, refreshTokenStats])

  useEffect(() => {
    const unfetched = wallets.filter((w) => !balances[w.id])
    if (unfetched.length > 0) refreshAllBalances(unfetched)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets])

  useEffect(() => {
    refreshTokenStats()
  }, [refreshTokenStats])

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

  const sortedWallets = [...wallets].sort((a, b) => {
    const tokenA = balances[a.id]?.token ?? -Infinity
    const tokenB = balances[b.id]?.token ?? -Infinity
    return tokenB - tokenA
  })

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Wallet Balances</h1>
          <p className="subtitle">
            SOL and{' '}
            <a
              href={tokenStats?.url ?? `https://solscan.io/token/${TOKEN_MINT}`}
              target="_blank"
              rel="noreferrer"
              className="mint-link"
            >
              {TOKEN_NAME} (${TOKEN_SYMBOL})
            </a>{' '}
            balances for {shortenAddress(TOKEN_MINT)}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={refreshAll} disabled={anyLoading || tokenStatsLoading}>
            {anyLoading || tokenStatsLoading ? 'Refreshing…' : 'Refresh all'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            + Add wallet
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Price</span>
          <span className="stat-value">
            {tokenStatsLoading && !tokenStats ? <span className="spinner" /> : formatPrice(tokenStats?.priceUsd)}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Market Cap</span>
          <span className="stat-value">
            {tokenStatsLoading && !tokenStats ? <span className="spinner" /> : formatUsd(tokenStats?.marketCapUsd)}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">24h Volume</span>
          <span className="stat-value">
            {tokenStatsLoading && !tokenStats ? <span className="spinner" /> : formatUsd(tokenStats?.volume24hUsd)}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Liquidity</span>
          <span className="stat-value">
            {tokenStatsLoading && !tokenStats ? <span className="spinner" /> : formatUsd(tokenStats?.liquidityUsd)}
          </span>
        </div>
      </div>
      {tokenStatsError && <p className="error-line stats-error">Token stats: {tokenStatsError}</p>}

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
              <th className="num">${TOKEN_SYMBOL}</th>
              <th className="num">% Supply</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedWallets.map((wallet) => {
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
                    {balance.loading ? <span className="spinner" /> : formatAmount(balance.token, 0)}
                  </td>
                  <td className="num">
                    {balance.loading ? <span className="spinner" /> : formatSupplyShare(balance.token)}
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
            <tr className="total-row">
              <td colSpan={2}>Total</td>
              <td className="num">{formatAmount(totals.hasSol ? totals.sol : null)}</td>
              <td className="num">{formatAmount(totals.hasToken ? totals.token : null, 0)}</td>
              <td className="num">{formatSupplyShare(totals.hasToken ? totals.token : null)}</td>
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
