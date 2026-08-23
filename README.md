# Wallet Balances

A small React + TypeScript app that tracks SOL and Cat Own Kimono ($COK)
balances across a list of Solana wallets, plus $COK's live market stats.

- Displays SOL balance and the balance of a fixed token mint
  (`Dnb9dLSXxAarXVexehzeH8W8nFmLMNJSuGoaddZSwtog`, $COK) for each wallet, with
  totals.
- Shows $COK price, market cap, 24h volume, and liquidity, sourced from
  Dexscreener.
- Ships with an initial list of wallets; use **+ Add wallet** to track more.
- The wallet list is shared, not per-browser: it's stored server-side, so
  everyone who opens the app sees the same list, and an add/remove is visible
  to all visitors (not just localStorage on one device).
- **Invested** column: a best-effort estimate of SOL spent acquiring $COK,
  computed on demand (see below) - not automatic, since it's expensive.

## Architecture

Wallet balance lookups (`getBalance`, `getTokenAccountsByOwner`) go through a
same-origin serverless function at `/api/rpc` (`api/rpc.ts`) rather than
being called directly from the browser. Calling a public Solana RPC straight
from client-side JS runs into per-origin CORS blocks and aggressive rate
limiting (surfaced as `403` errors); routing through a server-side proxy
avoids that, and lets all of a refresh's requests be batched into a single
JSON-RPC call instead of one per wallet.

The wallet list itself works the same way: `/api/wallets` (`api/wallets.ts`)
reads/writes a single JSON blob in Upstash Redis rather than the browser's
`localStorage`, so every visitor reads and writes the same list. `GET`
returns the current list (or the 6 default wallets if none has been saved
yet); `POST` overwrites it with the full list sent from the client.

`npm run dev` mirrors both `/api/rpc` and `/api/wallets` via Vite dev-server
middleware (see `vite.config.ts`), so both work locally without needing
`vercel dev`. The dev server also loads `.env` into `process.env` so
server-side vars like `SOLANA_RPC_URL` and the `UPSTASH_REDIS_REST_*` ones
below behave the same locally as they will on Vercel.

$COK (and SOL) market stats are fetched directly from Dexscreener's public
API client-side, since it's already CORS-enabled and requires no key.

### Invested (cost-basis estimate)

There's no historical price feed for a token like $COK, so an accurate,
fully-automatic "amount invested" isn't possible. Instead, clicking
**Calculate** (per wallet) or **Calculate invested** (all wallets, one at a
time) via `/api/cost-basis` (`api/cost-basis.ts` + `api/_costBasisHandler.ts`)
scans the wallet's last 100 $COK transactions and sums the SOL that left the
wallet in the same atomic transaction $COK arrived - i.e. an on-chain swap.

What this does and doesn't capture:

- ✅ Buying $COK on-chain with SOL (a Jupiter/Raydium/etc. swap)
- ❌ Buying with USDC or another token (no SOL leg to price it against)
- ❌ Depositing $COK withdrawn from a CEX (arrives with no matching outflow)
- ❌ Receiving $COK transferred from another wallet (same reason - and
  deliberately not guessed at, since it might be a transfer between two of
  your own tracked wallets, which isn't new investment)
- Only the most recent 100 transactions on the wallet's $COK token account
  are scanned; older activity beyond that is invisible to it (shown as `*`
  when this cap was hit)

So the number is a **lower bound**, not a precise cost basis - it undercounts
whenever $COK arrived by a path other than an on-chain SOL swap. Results are
cached (in the same Upstash store as the wallet list) so they persist and
don't recompute on every page load; use the ↻ next to a computed value, or
**Calculate invested** again, to refresh it.

This is also the slowest and most rate-limit-sensitive thing the app does -
each signature needs its own `getTransaction` call, a method public RPCs
throttle harder than balance checks. A dedicated `SOLANA_RPC_URL` (see below)
is close to required for this to work at all reliably; `vercel.json` also
raises this specific function's timeout to 60s since scanning 100
transactions can take a while.

## Development

```bash
npm install
npm run dev
```

## Configuration

### Wallet storage (required)

The shared wallet list needs an Upstash Redis database — it's free and takes
about a minute:

1. Create a database at [console.upstash.com](https://console.upstash.com)
   (or add the "Upstash for Redis" integration from the Vercel Marketplace,
   which does this and sets the env vars for you).
2. From the database's REST API section, copy the URL and token.
3. Set these as **server-side** env vars (no `VITE_` prefix) in Vercel under
   Project Settings → Environment Variables, then redeploy:

```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

Without these set, `/api/wallets` returns a 500 with an explanatory error
instead of silently failing, and the app shows it under the table as
"Wallets: ...".

### RPC endpoint

By default `/api/rpc` tries a short list of public, no-key RPC endpoints in
order (`solana-rpc.publicnode.com`, `rpc.ankr.com`, then
`api.mainnet-beta.solana.com`), falling through to the next if one blocks or
rate-limits the request. Public endpoints are still not reliable for
sustained use — they routinely 403 datacenter/serverless traffic outright.

For reliable balances, set `SOLANA_RPC_URL` (a **server-side** env var — no
`VITE_` prefix, so it's never exposed to the browser) to a dedicated RPC
endpoint. [Helius](https://helius.dev) has a free tier that works well for
this:

```
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

On Vercel, set this under Project Settings → Environment Variables, then
redeploy (env var changes don't apply to already-running deployments).

If balances still fail after that, check the error text shown under the
table — it now reports which endpoint(s) rejected the request and why. A
403 on *every* wallet at once (rather than sporadically) can also mean
Vercel's Deployment Protection is intercepting `/api/rpc` itself; check
Project Settings → Deployment Protection if so.

## Build

```bash
npm run build
```

## Deploy (Vercel)

Framework preset: **Vite**. Vercel auto-detects the build command
(`npm run build`), output directory (`dist`), and the `api/` serverless
function — no extra configuration needed.
