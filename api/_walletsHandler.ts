import { kvGet, kvSet } from './_kv.js'

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

/**
 * Shared wallet list, stored server-side in Upstash Redis (one JSON blob
 * under a single key) instead of the browser's localStorage, so every
 * visitor sees and edits the same list rather than each browser having
 * its own.
 */
export async function getWallets(): Promise<StoredWallet[]> {
  const result = await kvGet(KV_KEY)
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

  await kvSet(KV_KEY, JSON.stringify(body))
  return body
}
