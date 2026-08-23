import { getCachedCostBasis, refreshCostBasis } from './_costBasisHandler.js'

interface VercelLikeRequest {
  method?: string
  query?: Record<string, string | string[]>
  body?: unknown
}

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse
  json(body: unknown): void
}

function isValidSolanaAddress(address: unknown): address is string {
  return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  try {
    if (req.method === 'GET') {
      const address = req.query?.address
      if (!isValidSolanaAddress(address)) {
        res.status(400).json({ error: 'Missing or invalid "address" query param.' })
        return
      }
      res.status(200).json(await getCachedCostBasis(address))
      return
    }
    if (req.method === 'POST') {
      const address = (req.body as { address?: unknown } | undefined)?.address
      if (!isValidSolanaAddress(address)) {
        res.status(400).json({ error: 'Missing or invalid "address" in request body.' })
        return
      }
      res.status(200).json(await refreshCostBasis(address))
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}
