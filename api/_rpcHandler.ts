const DEFAULT_RPC_URL = 'https://rpc.ankr.com/solana'

const ALLOWED_METHODS = new Set(['getBalance', 'getTokenAccountsByOwner'])

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

/**
 * Forwards a batched JSON-RPC request to a Solana RPC endpoint on the
 * server side. Kept behind this proxy (rather than calling the RPC
 * directly from the browser) so wallet balance lookups aren't subject to
 * per-browser CORS/origin blocking or per-client rate limits, and so the
 * RPC endpoint can be swapped or authenticated via a server-only env var.
 */
export async function proxyRpc(body: unknown): Promise<ProxyResult> {
  const requests = Array.isArray(body) ? body : [body]

  if (requests.length === 0 || requests.length > 64) {
    return { status: 400, body: { error: 'Batch must contain between 1 and 64 requests.' } }
  }
  if (!requests.every(isValidRequest)) {
    return { status: 400, body: { error: 'Request contains an unsupported RPC method.' } }
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL

  const upstream = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await upstream.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { status: 502, body: { error: 'Upstream RPC returned a non-JSON response.' } }
  }

  return { status: upstream.ok ? 200 : upstream.status, body: parsed }
}
