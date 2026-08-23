import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mirrors api/rpc.ts so `npm run dev` can hit /api/rpc without needing
// `vercel dev`. Production deploys use the real serverless function.
function rpcDevProxy(): Plugin {
  return {
    name: 'rpc-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/rpc', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const chunks: Uint8Array[] = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8')
            const { proxyRpc } = await server.ssrLoadModule('/api/_rpcHandler.ts')
            const { status, body } = await proxyRpc(raw ? JSON.parse(raw) : null)
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(body))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: String(error) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), rpcDevProxy()],
})
