export interface Wallet {
  id: string
  name: string
  address: string
}

export interface WalletBalance {
  sol: number | null
  token: number | null
  error: string | null
  loading: boolean
}
