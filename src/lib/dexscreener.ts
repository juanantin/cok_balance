export interface TokenStats {
  name: string
  symbol: string
  priceUsd: number | null
  marketCapUsd: number | null
  volume24hUsd: number | null
  liquidityUsd: number | null
  url: string | null
}

interface DexscreenerPair {
  url?: string
  priceUsd?: string
  baseToken?: { name?: string; symbol?: string }
  marketCap?: number
  fdv?: number
  volume?: { h24?: number }
  liquidity?: { usd?: number }
}

interface DexscreenerResponse {
  pairs: DexscreenerPair[] | null
}

/**
 * Pulls market data (price, market cap, 24h volume, liquidity) for a token
 * mint from Dexscreener's public API. No API key required; picks the pair
 * with the most liquidity when a token trades on multiple DEXes/pools.
 */
export async function fetchTokenStats(mint: string): Promise<TokenStats | null> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
  if (!res.ok) {
    throw new Error(`Dexscreener request failed (${res.status})`)
  }

  const json: DexscreenerResponse = await res.json()
  if (!json.pairs || json.pairs.length === 0) return null

  const best = json.pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a))

  return {
    name: best.baseToken?.name ?? 'Cat Own Kimono',
    symbol: best.baseToken?.symbol ?? 'COK',
    priceUsd: best.priceUsd ? Number(best.priceUsd) : null,
    marketCapUsd: best.marketCap ?? best.fdv ?? null,
    volume24hUsd: best.volume?.h24 ?? null,
    liquidityUsd: best.liquidity?.usd ?? null,
    url: best.url ?? null,
  }
}
