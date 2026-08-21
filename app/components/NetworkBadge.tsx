'use client'

import { getNetworkName } from '@/lib/networks'
import { useVaultConfig } from '@/lib/vault-context'

/** Read-only label for the active vault's network (`config.chainId` → name). */
export default function NetworkBadge() {
  const { chainId } = useVaultConfig()
  const name = getNetworkName(chainId)

  return (
    <span
      title={`Chain ID ${chainId}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
      {name}
    </span>
  )
}
