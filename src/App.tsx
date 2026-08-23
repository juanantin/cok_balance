import { useCallback, useEffect, useState } from 'react'
import { AddWalletForm } from './components/AddWalletForm'
import { fetchCachedCostBasis, refreshCostBasis } from './lib/costBasis'
import type { CostBasisResult } from './lib/costBasis'
import { fetchTokenStats } from './lib/dexscreener'
import type { TokenStats } from './lib/dexscreener'
import { fetchAllBalances, fetchWalletBalance, SOL_MINT, TOKEN_MINT } from './lib/solana'
import { fetchWallets, makeWalletId, persistWallets } from './lib/wallets'
import type { Wallet, WalletBalance } from './types'

const TOKEN_NAME = 'Cat Own Kimono'
const TOKEN_SYMBOL = 'COK'
const TOKEN_SUPPLY = 1_000_000_000_000

const EMPTY_BALANCE: WalletBalance = { sol: null, token: null, error: null, loading: false }

function formatAmount(value: number | null, digits = 4): string {
  if (value === null) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}

// $COK balances run into the millions - compact notation (12.3K, 1.2M)
// keeps the column narrow instead of long grouped digit strings.
function formatTokenAmount(value: number | null): string {
  if (value === null) return '—'
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
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

// SOL spent per token acquired via on-chain swaps, converted to USD at the
// CURRENT SOL price (not the price at each swap's time - same caveat as
// the rest of the Invested estimate).
function computeAvgEntryPriceUsd(
  cb: CostBasisResult | null | undefined,
  solPriceUsd: number | null | undefined
): number | null {
  if (!cb || cb.tokensAcquiredViaSwap <= 0 || solPriceUsd == null) return null
  return (cb.investedSol / cb.tokensAcquiredViaSwap) * solPriceUsd
}

// Market cap implied by a per-token price, at the fixed total supply.
function priceToMarketCap(priceUsd: number | null): number | null {
  return priceUsd == null ? null : priceUsd * TOKEN_SUPPLY
}

function computeUsdValue(
  balance: WalletBalance,
  solPriceUsd: number | null | undefined,
  tokenPriceUsd: number | null | undefined
): number | null {
  if (balance.sol == null || balance.token == null || solPriceUsd == null || tokenPriceUsd == null) {
    return null
  }
  return balance.sol * solPriceUsd + balance.token * tokenPriceUsd
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

function App() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [walletsLoading, setWalletsLoading] = useState(true)
  const [walletsError, setWalletsError] = useState<string | null>(null)
  const [balances, setBalances] = useState<Record<string, WalletBalance>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null)
  const [solStats, setSolStats] = useState<TokenStats | null>(null)
  const [tokenStatsError, setTokenStatsError] = useState<string | null>(null)
  const [tokenStatsLoading, setTokenStatsLoading] = useState(false)
  const [costBasis, setCostBasis] = useState<Record<string, CostBasisResult | null>>({})
  const [costBasisLoading, setCostBasisLoading] = useState<Record<string, boolean>>({})
  const [costBasisErrors, setCostBasisErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchWallets()
      .then(setWallets)
      .catch((error) => setWalletsError(error instanceof Error ? error.message : String(error)))
      .finally(() => setWalletsLoading(false))
  }, [])

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
      const [stats, sol] = await Promise.all([fetchTokenStats(TOKEN_MINT), fetchTokenStats(SOL_MINT)])
      setTokenStats(stats)
      setSolStats(sol)
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

  const calculateCostBasis = useCallback(async (address: string) => {
    setCostBasisLoading((prev) => ({ ...prev, [address]: true }))
    setCostBasisErrors((prev) => {
      const next = { ...prev }
      delete next[address]
      return next
    })
    try {
      const result = await refreshCostBasis(address)
      setCostBasis((prev) => ({ ...prev, [address]: result }))
    } catch (error) {
      setCostBasisErrors((prev) => ({ ...prev, [address]: error instanceof Error ? error.message : String(error) }))
    } finally {
      setCostBasisLoading((prev) => ({ ...prev, [address]: false }))
    }
  }, [])

  const calculateAllCostBasis = useCallback(async () => {
    // Sequential on purpose: each call already scans up to 100
    // transactions server-side, so firing all wallets at once would pile
    // concurrent heavy RPC calls onto the same endpoint and invite more
    // rate-limiting, not less.
    for (const wallet of wallets) {
      await calculateCostBasis(wallet.address)
    }
  }, [wallets, calculateCostBasis])

  // For each newly-seen wallet: load whatever's cached (cheap - one KV
  // read), or if nothing's been computed yet, calculate it automatically.
  // Sequential per the same rate-limit reasoning as calculateAllCostBasis;
  // once a wallet has a cached value this never recomputes it on its own -
  // only the ↻ button does that.
  useEffect(() => {
    let cancelled = false
    async function run() {
      for (const wallet of wallets) {
        if (cancelled || wallet.address in costBasis) continue
        try {
          const cached = await fetchCachedCostBasis(wallet.address)
          if (cancelled) return
          if (cached) {
            setCostBasis((prev) => ({ ...prev, [wallet.address]: cached }))
          } else {
            await calculateCostBasis(wallet.address)
          }
        } catch (error) {
          if (cancelled) return
          setCostBasisErrors((prev) => ({
            ...prev,
            [wallet.address]: error instanceof Error ? error.message : String(error),
          }))
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets])

  async function handleAddWallet(name: string, address: string) {
    const wallet: Wallet = { id: makeWalletId(), name, address }
    const next = [...wallets, wallet]
    setWallets(next)
    setShowAddForm(false)
    try {
      await persistWallets(next)
    } catch (error) {
      setWalletsError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleRemoveWallet(id: string) {
    const next = wallets.filter((w) => w.id !== id)
    setWallets(next)
    setBalances((prev) => {
      const rest = { ...prev }
      delete rest[id]
      return rest
    })
    try {
      await persistWallets(next)
    } catch (error) {
      setWalletsError(error instanceof Error ? error.message : String(error))
    }
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

  const investedTotals = wallets.reduce(
    (acc, wallet) => {
      const cb = costBasis[wallet.address]
      if (cb) {
        acc.investedSol += cb.investedSol
        acc.tokensAcquiredViaSwap += cb.tokensAcquiredViaSwap
        acc.hasAny = true
      } else {
        acc.allCalculated = false
      }
      return acc
    },
    { investedSol: 0, tokensAcquiredViaSwap: 0, hasAny: false, allCalculated: true }
  )

  const anyLoading = wallets.some((w) => balances[w.id]?.loading)
  const costBasisAnyLoading = wallets.some((w) => costBasisLoading[w.address])

  const sortedWallets = [...wallets].sort((a, b) => {
    const tokenA = balances[a.id]?.token ?? -Infinity
    const tokenB = balances[b.id]?.token ?? -Infinity
    return tokenB - tokenA
  })

  return (
    <div className="page">
      <header className="page-header">
        <div className="title-group">
          <img src="/logo.png" alt="" className="logo" width={48} height={48} />
          <div>
            <h1>COK Wallet Balances</h1>
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
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={refreshAll} disabled={anyLoading || tokenStatsLoading}>
            {anyLoading || tokenStatsLoading ? 'Refreshing…' : 'Refresh all'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={calculateAllCostBasis}
            disabled={costBasisAnyLoading || wallets.length === 0}
            title="Best-effort estimate from on-chain swaps only - see Invested column"
          >
            {costBasisAnyLoading ? 'Calculating…' : 'Calculate invested'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            + Add wallet
          </button>
        </div>
      </header>

      <div className="stats-grid">
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
      {walletsError && <p className="error-line stats-error">Wallets: {walletsError}</p>}

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

      {walletsLoading ? (
        <div className="table-wrap">
          <p className="loading-placeholder">Loading wallets…</p>
        </div>
      ) : (
      <div className="table-wrap">
        <table className="wallet-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th className="num">SOL</th>
              <th className="num">$ Value</th>
              <th className="num">${TOKEN_SYMBOL}</th>
              <th className="num">% Supply</th>
              <th className="num" title="Best-effort: SOL spent in on-chain swaps only, last 100 txns">
                Invested
              </th>
              <th
                className="num"
                title="Market cap implied by the average price paid per token across on-chain swaps, at today's SOL price"
              >
                Avg Entry MC
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedWallets.map((wallet) => {
              const balance = balances[wallet.id] ?? EMPTY_BALANCE
              const cb = costBasis[wallet.address]
              const cbLoading = costBasisLoading[wallet.address]
              const cbError = costBasisErrors[wallet.address]
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
                    {balance.loading ? (
                      <span className="spinner" />
                    ) : (
                      formatUsd(computeUsdValue(balance, solStats?.priceUsd, tokenStats?.priceUsd))
                    )}
                  </td>
                  <td className="num">
                    {balance.loading ? <span className="spinner" /> : formatTokenAmount(balance.token)}
                  </td>
                  <td className="num">
                    {balance.loading ? <span className="spinner" /> : formatSupplyShare(balance.token)}
                  </td>
                  <td className="num invested-cell">
                    {cbLoading ? (
                      <span className="spinner" />
                    ) : cb ? (
                      <div className="invested-value">
                        <span>
                          {formatUsd(solStats?.priceUsd != null ? cb.investedSol * solStats.priceUsd : null)}
                          {cb.truncated && (
                            <span title={`Only the last ${cb.signaturesScanned} transactions were scanned`}> *</span>
                          )}
                        </span>
                        <button
                          className="icon-btn invested-recalc"
                          title="Recalculate"
                          onClick={() => calculateCostBasis(wallet.address)}
                        >
                          ↻
                        </button>
                      </div>
                    ) : cbError ? (
                      <button className="link-btn invested-error" title={cbError} onClick={() => calculateCostBasis(wallet.address)}>
                        Failed, retry
                      </button>
                    ) : (
                      <span className="invested-usd">pending…</span>
                    )}
                  </td>
                  <td className="num">
                    {cbLoading ? (
                      <span className="spinner" />
                    ) : (
                      formatUsd(priceToMarketCap(computeAvgEntryPriceUsd(cb, solStats?.priceUsd)))
                    )}
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
              <td className="num">
                {formatUsd(
                  totals.hasSol && totals.hasToken
                    ? computeUsdValue({ sol: totals.sol, token: totals.token, error: null, loading: false }, solStats?.priceUsd, tokenStats?.priceUsd)
                    : null
                )}
              </td>
              <td className="num">{formatTokenAmount(totals.hasToken ? totals.token : null)}</td>
              <td className="num">{formatSupplyShare(totals.hasToken ? totals.token : null)}</td>
              <td className="num invested-cell">
                {investedTotals.hasAny ? (
                  <>
                    {formatUsd(solStats?.priceUsd != null ? investedTotals.investedSol * solStats.priceUsd : null)}
                    {!investedTotals.allCalculated && <span title="Not all wallets calculated yet"> *</span>}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className="num">
                {formatUsd(
                  priceToMarketCap(
                    investedTotals.hasAny && investedTotals.tokensAcquiredViaSwap > 0 && solStats?.priceUsd != null
                      ? (investedTotals.investedSol / investedTotals.tokensAcquiredViaSwap) * solStats.priceUsd
                      : null
                  )
                )}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}

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
