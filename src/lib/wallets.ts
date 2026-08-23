import type { Wallet } from '../types'

/**
 * Wallet list now lives server-side (see api/wallets.ts) so every visitor
 * shares the same list instead of each browser keeping its own in
 * localStorage. Fetch on load, push the full list back on every add/remove.
 */
export async function fetchWallets(): Promise<Wallet[]> {
  const res = await fetch('/api/wallets')
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Failed to load wallets (${res.status})`)
  }
  return res.json()
}

export async function persistWallets(wallets: Wallet[]): Promise<void> {
  const res = await fetch('/api/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wallets),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Failed to save wallets (${res.status})`)
  }
}

export function makeWalletId(): string {
  return `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
