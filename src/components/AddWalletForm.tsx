import { useState } from 'react'
import { isValidSolanaAddress } from '../lib/solana'

interface AddWalletFormProps {
  onAdd: (name: string, address: string) => void
  onCancel: () => void
  existingAddresses: string[]
}

export function AddWalletForm({ onAdd, onCancel, existingAddresses }: AddWalletFormProps) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedAddress = address.trim()

    if (!trimmedName) {
      setError('Please enter a wallet name.')
      return
    }
    if (!isValidSolanaAddress(trimmedAddress)) {
      setError('That doesn’t look like a valid Solana address.')
      return
    }
    if (existingAddresses.includes(trimmedAddress)) {
      setError('This wallet is already in the list.')
      return
    }

    onAdd(trimmedName, trimmedAddress)
  }

  return (
    <form className="add-wallet-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="wallet-name">Name</label>
        <input
          id="wallet-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          autoFocus
        />
      </div>
      <div className="form-row">
        <label htmlFor="wallet-address">Address</label>
        <input
          id="wallet-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Solana wallet address"
          spellCheck={false}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Add wallet
        </button>
      </div>
    </form>
  )
}
