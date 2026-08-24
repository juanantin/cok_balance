import { debugCostBasis } from './_costBasisHandler.js'

interface VercelLikeRequest {
  method?: string
  query?: Record<string, string | string[]>
}

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse
  json(body: unknown): void
}

function isValidSolanaAddress(address: unknown): address is string {
  return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

/**
 * Diagnostic-only endpoint (not linked from the UI): open
 * /api/cost-basis-debug?address=<wallet> in a browser to see the full
 * per-transaction breakdown behind the Invested figure - useful for
 * "why did this wallet come out to $0" without needing chain-explorer
 * access. Not cached; every hit re-scans.
 */
export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }
    const address = req.query?.address
    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ error: 'Missing or invalid "address" query param.' })
      return
    }
    res.status(200).json(await debugCostBasis(address))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}
