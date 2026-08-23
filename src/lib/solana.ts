export const TOKEN_MINT = 'Dnb9dLSXxAarXVexehzeH8W8nFmLMNJSuGoaddZSwtog'

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isValidSolanaAddress(address: string): boolean {
  return BASE58_RE.test(address.trim())
}

let requestId = 0

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method,
      params,
    }),
  })

  if (!res.ok) {
    throw new Error(`RPC request failed (${res.status})`)
  }

  const json = await res.json()
  if (json.error) {
    throw new Error(json.error.message || 'RPC error')
  }
  return json.result as T
}

export async function getSolBalance(address: string): Promise<number> {
  const result = await rpcCall<{ value: number }>('getBalance', [address])
  return result.value / 1e9
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

export async function getTokenBalance(address: string, mint: string): Promise<number> {
  const result = await rpcCall<TokenAccountsResult>('getTokenAccountsByOwner', [
    address,
    { mint },
    { encoding: 'jsonParsed' },
  ])
  return result.value.reduce((sum, acc) => {
    const amount = acc.account.data.parsed.info.tokenAmount.uiAmount
    return sum + (amount ?? 0)
  }, 0)
}

export interface FetchedBalance {
  sol: number | null
  token: number | null
  error: string | null
}

export async function fetchWalletBalance(address: string): Promise<FetchedBalance> {
  const [solResult, tokenResult] = await Promise.allSettled([
    getSolBalance(address),
    getTokenBalance(address, TOKEN_MINT),
  ])

  const errors: string[] = []
  if (solResult.status === 'rejected') errors.push(String(solResult.reason?.message ?? solResult.reason))
  if (tokenResult.status === 'rejected') errors.push(String(tokenResult.reason?.message ?? tokenResult.reason))

  return {
    sol: solResult.status === 'fulfilled' ? solResult.value : null,
    token: tokenResult.status === 'fulfilled' ? tokenResult.value : null,
    error: errors.length > 0 ? errors.join('; ') : null,
  }
}
