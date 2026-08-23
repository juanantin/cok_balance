import type { Wallet } from '../types'

const STORAGE_KEY = 'cok-balance-wallets'

export const DEFAULT_WALLETS: Wallet[] = [
  { id: 'gnappa', name: 'Gnappa', address: 'gMjCLUfBX3fv3VWTyvE6vsyKtxUupC133da2xw8Jakz' },
  { id: 'jack', name: 'Jack', address: '45RvAw5LiHZpBBy77vQBFPmyHw9ptF9uaESCMW3XGyfR' },
  { id: 'jack-juan', name: 'Jack + Juan', address: 'GfmH396hr7X4TUhkVduPFNVoiWogLyTVbmEffJkjYhx7' },
  { id: 'simone', name: 'Simone', address: 'BaT2Vf4HKhxxXU2ZsnbeJHkqqZ8FHPBgE3V2fGAj2PmQ' },
  { id: 'jack-2', name: 'Jack 2', address: 'AJK7CSkM2pjpKe9tMomexXP7kXemZPZo2aTtRvW1k3NR' },
  { id: 'juan', name: 'Juan', address: 'BmaCNKYQ44kK99C3FSHu5txDmM5TyzDbLBdziG1oEgv3' },
]

export function loadWallets(): Wallet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WALLETS
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
    return DEFAULT_WALLETS
  } catch {
    return DEFAULT_WALLETS
  }
}

export function saveWallets(wallets: Wallet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets))
}

export function makeWalletId(): string {
  return `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
