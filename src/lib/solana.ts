export const TOKEN_MINT = 'Dnb9dLSXxAarXVexehzeH8W8nFmLMNJSuGoaddZSwtog'

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isValidSolanaAddress(address: string): boolean {
  return BASE58_RE.test(address.trim())
}

export interface FetchedBalance {
  sol: number | null
  token: number | null
  error: string | null
}

interface JsonRpcResponse {
  id: number
  error?: { message: string }
  result?: unknown
}

interface TokenAccountsResult {
  value: Array<{
    account: {
      data: {
        parsed: {
          info: {
            tokenAmount: {
              uiAmount: number | null
            }
          }
        }
      }
    }
  }>
}

// Two RPC calls per wallet: SOL balance, and the token's ATAs.
const CALLS_PER_WALLET = 2

/**
 * Fetches SOL and token balances for every address in one batched call to
 * the /api/rpc proxy, instead of one browser-to-RPC request per wallet.
 * Batching keeps this well under public RPC rate limits and avoids the
 * per-origin CORS/403 blocks browsers hit calling Solana RPCs directly.
 */
export async function fetchAllBalances(addresses: string[]): Promise<Record<string, FetchedBalance>> {
  if (addresses.length === 0) return {}

  const batch = addresses.flatMap((address, i) => [
    {
      jsonrpc: '2.0',
      id: i * CALLS_PER_WALLET,
      method: 'getBalance',
      params: [address],
    },
    {
      jsonrpc: '2.0',
      id: i * CALLS_PER_WALLET + 1,
      method: 'getTokenAccountsByOwner',
      params: [address, { mint: TOKEN_MINT }, { encoding: 'jsonParsed' }],
    },
  ])

  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error ? String(body.error) : `Balance lookup failed (${res.status})`
    return Object.fromEntries(addresses.map((address) => [address, { sol: null, token: null, error: message }]))
  }

  const results: JsonRpcResponse[] = await res.json()
  const byId = new Map(results.map((r) => [r.id, r]))

  const balances: Record<string, FetchedBalance> = {}
  addresses.forEach((address, i) => {
    const solResponse = byId.get(i * CALLS_PER_WALLET)
    const tokenResponse = byId.get(i * CALLS_PER_WALLET + 1)

    const errors: string[] = []
    let sol: number | null = null
    let token: number | null = null

    if (solResponse?.error) {
      errors.push(solResponse.error.message)
    } else if (solResponse?.result) {
      sol = (solResponse.result as { value: number }).value / 1e9
    }

    if (tokenResponse?.error) {
      errors.push(tokenResponse.error.message)
    } else if (tokenResponse?.result) {
      const accounts = (tokenResponse.result as TokenAccountsResult).value
      token = accounts.reduce((sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0)
    }

    balances[address] = { sol, token, error: errors.length > 0 ? errors.join('; ') : null }
  })

  return balances
}

export async function fetchWalletBalance(address: string): Promise<FetchedBalance> {
  const balances = await fetchAllBalances([address])
  return balances[address]
}
