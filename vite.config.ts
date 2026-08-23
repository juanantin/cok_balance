import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf-8')
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// Mirrors api/rpc.ts so `npm run dev` can hit /api/rpc without needing
// `vercel dev`. Production deploys use the real serverless function.
function rpcDevProxy(): Plugin {
  return {
    name: 'rpc-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/rpc', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
        try {
          const raw = await readBody(req)
          const { proxyRpc } = await server.ssrLoadModule('/api/_rpcHandler.ts')
          const { status, body } = await proxyRpc(raw ? JSON.parse(raw) : null)
          sendJson(res, status, body)
        } catch (error) {
          sendJson(res, 500, { error: String(error) })
        }
      })
    },
  }
}

// Mirrors api/wallets.ts for the same reason.
function walletsDevProxy(): Plugin {
  return {
    name: 'wallets-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/wallets', async (req, res) => {
        try {
          const { getWallets, saveWallets } = await server.ssrLoadModule('/api/_walletsHandler.ts')
          if (req.method === 'GET') {
            sendJson(res, 200, await getWallets())
            return
          }
          if (req.method === 'POST') {
            const raw = await readBody(req)
            sendJson(res, 200, await saveWallets(raw ? JSON.parse(raw) : null))
            return
          }
          sendJson(res, 405, { error: 'Method not allowed' })
        } catch (error) {
          sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars to import.meta.env; the dev
  // middlewares above run server-side code (api/_rpcHandler.ts,
  // api/_walletsHandler.ts) that reads plain process.env, same as it will
  // on Vercel. Loading .env into process.env here keeps local dev and
  // production behaving the same way.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [react(), rpcDevProxy(), walletsDevProxy()],
  }
})
