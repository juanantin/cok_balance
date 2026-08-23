import { proxyRpc } from './_rpcHandler.js'

interface VercelLikeRequest {
  method?: string
  body?: unknown
}

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse
  json(body: unknown): void
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { status, body } = await proxyRpc(req.body)
  res.status(status).json(body)
}
