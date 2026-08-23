# Wallet Balances

A small React + TypeScript app that tracks SOL and SPL token balances across a
list of Solana wallets.

- Displays SOL balance and the balance of a fixed token mint
  (`Dnb9dLSXxAarXVexehzeH8W8nFmLMNJSuGoaddZSwtog`) for each wallet.
- Ships with an initial list of wallets; use **+ Add wallet** to track more.
- Wallets are persisted in the browser's `localStorage`, so the list survives
  page reloads.
- Balances are fetched client-side from a public Solana RPC endpoint.

## Development

```bash
npm install
npm run dev
```

## Configuration

By default the app queries the public `https://api.mainnet-beta.solana.com`
RPC endpoint. To use a different endpoint (recommended for heavier use, since
the public endpoint is rate-limited), set `VITE_SOLANA_RPC_URL` in a `.env`
file:

```
VITE_SOLANA_RPC_URL=https://your-rpc-provider.example.com
```

## Build

```bash
npm run build
```
