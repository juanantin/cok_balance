import { kvGet, kvSet } from './_kv.js'
import { callRpcBatch } from './_rpcHandler.js'
import type { JsonRpcRequest } from './_rpcHandler.js'

const TOKEN_MINT = 'Dnb9dLSXxAarXVexehzeH8W8nFmLMNJSuGoaddZSwtog'
const WSOL_MINT = 'So11111111111111111111111111111111111111112'

// How far back to scan. Every signature needs its own getTransaction call
// (a "heavy" RPC method many providers rate-limit harder than getBalance),
// so this trades completeness for staying inside serverless time/rate
// budgets - see README for the tradeoff this implies.
const SIGNATURE_LIMIT = 100
const TX_FETCH_CONCURRENCY = 5

// Any transaction the wallet pays for shows a small negative SOL delta
// just from the network fee, even a pure incoming transfer. Require
// spending clearly more than a fee to count as an actual swap.
const MIN_SOL_SPENT_TO_COUNT_AS_BUY = 0.001

export interface CostBasisResult {
  address: string
  investedSol: number
  tokensAcquiredViaSwap: number
  signaturesScanned: number
  truncated: boolean
  computedAt: number
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const request: JsonRpcRequest = { jsonrpc: '2.0', id: 0, method, params }
  const [response] = await callRpcBatch([request])
  const typed = response as { result?: unknown; error?: { message: string } }
  if (typed.error) throw new Error(typed.error.message)
  return typed.result
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

interface ParsedTransaction {
  transaction: { message: { accountKeys: Array<string | { pubkey: string }> } }
  meta: {
    preBalances: number[]
    postBalances: number[]
    preTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount: { uiAmount: number | null } }>
    postTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount: { uiAmount: number | null } }>
    loadedAddresses?: { writable: string[]; readonly: string[] }
  } | null
}

function tokenDeltaFor(
  mint: string,
  owner: string,
  meta: NonNullable<ParsedTransaction['meta']>
): number {
  const pre = meta.preTokenBalances?.find((b) => b.owner === owner && b.mint === mint)
  const post = meta.postTokenBalances?.find((b) => b.owner === owner && b.mint === mint)
  return (post?.uiTokenAmount.uiAmount ?? 0) - (pre?.uiTokenAmount.uiAmount ?? 0)
}

/**
 * Best-effort "initial investment" for a wallet: sums the SOL spent in
 * transactions where SOL left the wallet and $COK arrived in the SAME
 * atomic transaction (an on-chain swap). "SOL spent" counts either the
 * wallet's native balance or a wrapped-SOL (WSOL) token balance dropping -
 * bonding-curve launchpads (pump.fun, fomo.family, etc.) commonly debit a
 * persistent WSOL account rather than native lamports, which would
 * otherwise look like a plain transfer. A CEX withdrawal, a
 * USDC-denominated buy, or a transfer from another wallet still show up
 * as $COK arriving with no matching outflow either way, so those are left
 * out rather than guessed at. Scoped to the most recent SIGNATURE_LIMIT
 * transactions on the wallet's $COK token account.
 */
export async function computeCostBasis(address: string): Promise<CostBasisResult> {
  const tokenAccounts = (await rpc('getTokenAccountsByOwner', [
    address,
    { mint: TOKEN_MINT },
    { encoding: 'jsonParsed' },
  ])) as { value: Array<{ pubkey: string }> }

  const ata = tokenAccounts.value[0]?.pubkey
  if (!ata) {
    return { address, investedSol: 0, tokensAcquiredViaSwap: 0, signaturesScanned: 0, truncated: false, computedAt: Date.now() }
  }

  const signatures = (await rpc('getSignaturesForAddress', [ata, { limit: SIGNATURE_LIMIT }])) as Array<{
    signature: string
  }>

  let investedSol = 0
  let tokensAcquiredViaSwap = 0

  await mapWithConcurrency(signatures, TX_FETCH_CONCURRENCY, async ({ signature }) => {
    const tx = (await rpc('getTransaction', [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ]).catch(() => null)) as ParsedTransaction | null
    if (!tx?.meta) return

    const staticKeys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey))
    const accountKeys = [
      ...staticKeys,
      ...(tx.meta.loadedAddresses?.writable ?? []),
      ...(tx.meta.loadedAddresses?.readonly ?? []),
    ]
    const walletIdx = accountKeys.indexOf(address)
    if (walletIdx === -1) return

    const nativeSolDelta = (tx.meta.postBalances[walletIdx] - tx.meta.preBalances[walletIdx]) / 1e9
    const wsolDelta = tokenDeltaFor(WSOL_MINT, address, tx.meta)
    const tokenDelta = tokenDeltaFor(TOKEN_MINT, address, tx.meta)

    // "SOL spent" can come from native lamports, a WSOL token balance, or
    // both at once (e.g. a top-up wrap in the same tx as the spend) - sum
    // whichever side(s) show a real (non-fee-sized) decrease.
    let solSpent = 0
    if (nativeSolDelta < -MIN_SOL_SPENT_TO_COUNT_AS_BUY) solSpent += -nativeSolDelta
    if (wsolDelta < -MIN_SOL_SPENT_TO_COUNT_AS_BUY) solSpent += -wsolDelta

    // Only count it as a buy when SOL clearly left and $COK arrived together.
    if (tokenDelta > 0 && solSpent > 0) {
      investedSol += solSpent
      tokensAcquiredViaSwap += tokenDelta
    }
  })

  return {
    address,
    investedSol,
    tokensAcquiredViaSwap,
    signaturesScanned: signatures.length,
    truncated: signatures.length >= SIGNATURE_LIMIT,
    computedAt: Date.now(),
  }
}

function kvKey(address: string): string {
  return `cok-balance-cost-basis:${address}`
}

export async function getCachedCostBasis(address: string): Promise<CostBasisResult | null> {
  const raw = await kvGet(kvKey(address))
  if (!raw) return null
  try {
    return JSON.parse(raw) as CostBasisResult
  } catch {
    return null
  }
}

export async function refreshCostBasis(address: string): Promise<CostBasisResult> {
  const result = await computeCostBasis(address)
  await kvSet(kvKey(address), JSON.stringify(result))
  return result
}
