import { getWallets, saveWallets } from './_walletsHandler.js'

interface VercelLikeRequest {
  method?: string
  body?: unknown
}

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse
  json(body: unknown): void
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  try {
    if (req.method === 'GET') {
      res.status(200).json(await getWallets())
      return
    }
    if (req.method === 'POST') {
      res.status(200).json(await saveWallets(req.body))
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}
