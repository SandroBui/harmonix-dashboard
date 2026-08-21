'use client'

import { truncateAddress } from '@/lib/format'
import { getSafeChainLabel } from '@/lib/safe/chains'
import type { VaultSafeOption } from '@/lib/safe/vault-safes'

/**
 * One entry of the config Safe list. Entries are addressed by index because the
 * same Safe address may be listed under more than one label.
 */
export type SafeSelection = number

type Props = {
  options: VaultSafeOption[]
  /** `null` only when the vault has no Safe configured. */
  value: SafeSelection | null
  onChange: (value: SafeSelection) => void
  /** The chain name is appended only for Safes that sit off the vault chain. */
  vaultChainId: number
}

export default function SafeWalletSelect({ options, value, onChange, vaultChainId }: Props) {
  const isEmpty = options.length === 0

  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
      Safe wallet
      <select
        value={value === null ? '' : String(value)}
        disabled={isEmpty}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs font-medium text-neutral-700 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        {isEmpty && <option value="">No Safe configured</option>}
        {options.map((option, index) => (
          <option key={`${index}-${option.address}`} value={String(index)}>
            {option.label} ({truncateAddress(option.address)})
            {option.chainId !== vaultChainId ? ` · ${getSafeChainLabel(option.chainId)}` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
