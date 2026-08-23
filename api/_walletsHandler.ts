export interface StoredWallet {
  id: string
  name: string
  address: string
}

const DEFAULT_WALLETS: StoredWallet[] = [
  { id: 'gnappa', name: 'Gnappa', address: 'gMjCLUfBX3fv3VWTyvE6vsyKtxUupC133da2xw8Jakz' },
  { id: 'jack', name: 'Jack', address: '45RvAw5LiHZpBBy77vQBFPmyHw9ptF9uaESCMW3XGyfR' },
  { id: 'jack-juan', name: 'Jack + Juan', address: 'GfmH396hr7X4TUhkVduPFNVoiWogLyTVbmEffJkjYhx7' },
  { id: 'simone', name: 'Simone', address: 'BaT2Vf4HKhxxXU2ZsnbeJHkqqZ8FHPBgE3V2fGAj2PmQ' },
  { id: 'jack-2', name: 'Jack 2', address: 'AJK7CSkM2pjpKe9tMomexXP7kXemZPZo2aTtRvW1k3NR' },
  { id: 'juan', name: 'Juan', address: 'BmaCNKYQ44kK99C3FSHu5txDmM5TyzDbLBdziG1oEgv3' },
]

const KV_KEY = 'cok-balance-wallets'
const MAX_WALLETS = 200

function restConfig(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error(
      'Wallet storage isn\'t configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (see README).'
    )
  }
  return { url, token }
}

/**
 * Shared wallet list, stored server-side in Upstash Redis (one JSON blob
 * under a single key) instead of the browser's localStorage, so every
 * visitor sees and edits the same list rather than each browser having
 * its own. Plain REST calls, no SDK - Upstash's free tier is more than
 * enough for this.
 */
export async function getWallets(): Promise<StoredWallet[]> {
  const { url, token } = restConfig()
  const res = await fetch(`${url}/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Wallet storage read failed (${res.status})`)
  }

  const { result } = (await res.json()) as { result: string | null }
  if (!result) return DEFAULT_WALLETS

  try {
    const parsed = JSON.parse(result)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_WALLETS
  } catch {
    return DEFAULT_WALLETS
  }
}

function isValidWallet(value: unknown): value is StoredWallet {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredWallet).id === 'string' &&
    typeof (value as StoredWallet).name === 'string' &&
    typeof (value as StoredWallet).address === 'string'
  )
}

export async function saveWallets(body: unknown): Promise<StoredWallet[]> {
  if (!Array.isArray(body) || body.length > MAX_WALLETS || !body.every(isValidWallet)) {
    throw new Error('Invalid wallet list.')
  }

  const { url, token } = restConfig()
  const res = await fetch(`${url}/set/${KV_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Wallet storage write failed (${res.status})`)
  }

  return body
}
