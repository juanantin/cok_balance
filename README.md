# Wallet Balances

A small React + TypeScript app that tracks SOL and Cat Own Kimono ($COK)
balances across a list of Solana wallets, plus $COK's live market stats.

- Displays SOL balance and the balance of a fixed token mint
  (`Dnb9dLSXxAarXVexehzeH8W8nFmLMNJSuGoaddZSwtog`, $COK) for each wallet, with
  totals.
- Shows $COK price, market cap, 24h volume, and liquidity, sourced from
  Dexscreener.
- Ships with an initial list of wallets; use **+ Add wallet** to track more.
- Wallets are persisted in the browser's `localStorage`, so the list survives
  page reloads.

## Architecture

Wallet balance lookups (`getBalance`, `getTokenAccountsByOwner`) go through a
same-origin serverless function at `/api/rpc` (`api/rpc.ts`) rather than
being called directly from the browser. Calling a public Solana RPC straight
from client-side JS runs into per-origin CORS blocks and aggressive rate
limiting (surfaced as `403` errors); routing through a server-side proxy
avoids that, and lets all of a refresh's requests be batched into a single
JSON-RPC call instead of one per wallet.

`npm run dev` mirrors the same proxy logic via a Vite dev-server middleware
(see `vite.config.ts`), so it works locally without needing `vercel dev`.

$COK market stats are fetched directly from Dexscreener's public API
client-side, since it's already CORS-enabled and requires no key.

## Development

```bash
npm install
npm run dev
```

## Configuration

By default `/api/rpc` forwards to the public `https://rpc.ankr.com/solana`
endpoint. For heavier use, set `SOLANA_RPC_URL` (a **server-side** env var —
no `VITE_` prefix, so it's never exposed to the browser) to a dedicated RPC
provider, e.g. from [Helius](https://helius.dev):

```
SOLANA_RPC_URL=https://your-rpc-provider.example.com
```

On Vercel, set this under Project Settings → Environment Variables.

## Build

```bash
npm run build
```

## Deploy (Vercel)

Framework preset: **Vite**. Vercel auto-detects the build command
(`npm run build`), output directory (`dist`), and the `api/` serverless
function — no extra configuration needed.
