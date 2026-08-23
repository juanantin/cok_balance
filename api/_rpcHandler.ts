// Public, no-key Solana RPC endpoints, tried in order. None of these are
// guaranteed to stay reliable long-term (they rate-limit and occasionally
// block datacenter/serverless IPs outright), which is why SOLANA_RPC_URL
// lets you override with a dedicated provider (e.g. Helius) that won't.
const FALLBACK_RPC_URLS = [
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana',
  'https://api.mainnet-beta.solana.com',
]

const ALLOWED_METHODS = new Set(['getBalance', 'getTokenAccountsByOwner'])
const REQUEST_TIMEOUT_MS = 8000

interface JsonRpcRequest {
  jsonrpc: string
  id: number | string
  method: string
  params: unknown[]
}

export interface ProxyResult {
  status: number
  body: unknown
}

function isValidRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as JsonRpcRequest).method === 'string' &&
    ALLOWED_METHODS.has((value as JsonRpcRequest).method) &&
    Array.isArray((value as JsonRpcRequest).params)
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

// Sends each JSON-RPC request as its own POST rather than a batch array.
// Several public gateways (publicnode among them) reject batch arrays
// outright with a 400, so single requests are the only format every
// provider is guaranteed to accept. Requests still run concurrently.
async function callEndpoint(url: string, requests: JsonRpcRequest[]): Promise<unknown[]> {
  return Promise.all(
    requests.map(async (request) => {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!upstream.ok) {
        throw new Error(String(upstream.status))
      }

      return JSON.parse(await upstream.text())
    })
  )
}

/**
 * Forwards a batch of JSON-RPC requests to a Solana RPC endpoint on the
 * server side. Kept behind this proxy (rather than calling the RPC
 * directly from the browser) so wallet balance lookups aren't subject to
 * per-browser CORS/origin blocking or per-client rate limits.
 *
 * Public RPC endpoints frequently reject batches, rate-limit, or block
 * serverless IPs outright, so this walks a list of candidates - starting
 * with SOLANA_RPC_URL if set - until one answers every request in the
 * batch successfully, rather than failing on the first block.
 */
export async function proxyRpc(body: unknown): Promise<ProxyResult> {
  const requests = Array.isArray(body) ? body : [body]

  if (requests.length === 0 || requests.length > 64) {
    return { status: 400, body: { error: 'Batch must contain between 1 and 64 requests.' } }
  }
  if (!requests.every(isValidRequest)) {
    return { status: 400, body: { error: 'Request contains an unsupported RPC method.' } }
  }

  const configuredUrl = process.env.SOLANA_RPC_URL
  const candidates = configuredUrl ? [configuredUrl, ...FALLBACK_RPC_URLS] : FALLBACK_RPC_URLS

  const failures: string[] = []

  for (const url of candidates) {
    try {
      const responses = await callEndpoint(url, requests as JsonRpcRequest[])
      return { status: 200, body: responses }
    } catch (error) {
      failures.push(`${hostOf(url)} → ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    status: 502,
    body: { error: `All RPC endpoints failed: ${failures.join('; ')}` },
  }
}
