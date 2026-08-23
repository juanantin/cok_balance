export interface CostBasisResult {
  address: string
  investedSol: number
  tokensAcquiredViaSwap: number
  signaturesScanned: number
  truncated: boolean
  computedAt: number
}

async function parseErrorResponse(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

/** Reads the cached estimate for a wallet, or null if none has been computed yet. */
export async function fetchCachedCostBasis(address: string): Promise<CostBasisResult | null> {
  const res = await fetch(`/api/cost-basis?address=${encodeURIComponent(address)}`)
  if (!res.ok) {
    throw new Error(await parseErrorResponse(res, `Failed to load invested amount (${res.status})`))
  }
  return res.json()
}

/** Recomputes the estimate from on-chain history (slow - see README) and caches it. */
export async function refreshCostBasis(address: string): Promise<CostBasisResult> {
  const res = await fetch('/api/cost-basis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  if (!res.ok) {
    throw new Error(await parseErrorResponse(res, `Failed to calculate invested amount (${res.status})`))
  }
  return res.json()
}
