'use client'

import { usePendingSafeTransactions, useSafeInfo, useResolvedRoleSafes } from '@/lib/safe/hooks'
import { getResolvedSafeAddressForRole } from '@/lib/safe/roles'
import type { RoleType } from '@/lib/safe/roles'
import { useVaultConfig } from '@/lib/vault-context'
import type { PendingSafeTx, SafeInfo } from '@/lib/safe/types'
import SafeTxList from './SafeTxList'

export type RoleTaggedTx = PendingSafeTx & {
  roles: RoleType[]
  safeAddress: `0x${string}`
  safeInfo: SafeInfo | undefined
}

/** Maps a decoded function name to the role required to execute it. */
function inferRoleFromMethod(method: string | undefined): RoleType | null {
  switch (method) {
    case 'fulfillRedeem':
    case 'cancelRedeem':
      return 'operator'
    case 'addStrategy':
    case 'removeStrategy':
    case 'setStrategyCap':
    case 'allocate':
    case 'deallocate':
      return 'curator'
    case 'syncNavValue':
    case 'updateNav':
      return 'operator'
    case 'submit':
      return 'timelock_proposer'
    case 'addNavCategory':
    case 'removeNavCategory':
    case 'setCategoryStatus':
    case 'setTimelockDuration':
    case 'grantRole':
    case 'revokeRole':
    case 'setRoleTimelock':
      return 'admin'
    case 'cancelPendingGrant':
      return 'sentinel'
    default:
      return null
  }
}

// Hooks must be called unconditionally at the top level — one pair per role.
function useAllRoleTxs(vaultAssetMap: Record<string, string>): {
  txs: RoleTaggedTx[]
  isLoading: boolean
  hasError: boolean
  refetchAll: () => void
} {
  const config = useVaultConfig()
  const { data: resolved } = useResolvedRoleSafes()
  const addrOperator          = getResolvedSafeAddressForRole(config, 'operator', resolved?.resolvedSafes)
  const addrCurator           = getResolvedSafeAddressForRole(config, 'curator', resolved?.resolvedSafes)
  const addrPriceUpdater      = getResolvedSafeAddressForRole(config, 'price_updater', resolved?.resolvedSafes)
  const addrTimelockProposer  = getResolvedSafeAddressForRole(config, 'timelock_proposer', resolved?.resolvedSafes)
  const addrAdmin             = getResolvedSafeAddressForRole(config, 'admin', resolved?.resolvedSafes)

  const qOperator          = usePendingSafeTransactions(addrOperator,          vaultAssetMap)
  const qCurator           = usePendingSafeTransactions(addrCurator,           vaultAssetMap)
  const qPriceUpdater      = usePendingSafeTransactions(addrPriceUpdater,      vaultAssetMap)
  const qTimelockProposer  = usePendingSafeTransactions(addrTimelockProposer,  vaultAssetMap)
  const qAdmin             = usePendingSafeTransactions(addrAdmin,             vaultAssetMap)

  const sOperator          = useSafeInfo(addrOperator)
  const sCurator           = useSafeInfo(addrCurator)
  const sPriceUpdater      = useSafeInfo(addrPriceUpdater)
  const sTimelockProposer  = useSafeInfo(addrTimelockProposer)
  const sAdmin             = useSafeInfo(addrAdmin)

  const isLoading = qOperator.isLoading || qCurator.isLoading || qPriceUpdater.isLoading || qTimelockProposer.isLoading || qAdmin.isLoading
  const hasError  = Boolean(qOperator.error || qCurator.error || qPriceUpdater.error || qTimelockProposer.error || qAdmin.error)

  function refetchAll() {
    qOperator.refetch()
    qCurator.refetch()
    qPriceUpdater.refetch()
    qTimelockProposer.refetch()
    qAdmin.refetch()
  }

  // Merge: deduplicate by safeTxHash, accumulate roles when same tx appears across roles
  const entries: [RoleType, `0x${string}`, PendingSafeTx[] | undefined, SafeInfo | undefined][] = [
    ['operator',           addrOperator,         qOperator.data          as PendingSafeTx[] | undefined, sOperator.data          as SafeInfo | undefined],
    ['curator',            addrCurator,          qCurator.data           as PendingSafeTx[] | undefined, sCurator.data           as SafeInfo | undefined],
    ['price_updater',      addrPriceUpdater,     qPriceUpdater.data      as PendingSafeTx[] | undefined, sPriceUpdater.data      as SafeInfo | undefined],
    ['timelock_proposer',  addrTimelockProposer, qTimelockProposer.data  as PendingSafeTx[] | undefined, sTimelockProposer.data  as SafeInfo | undefined],
    ['admin',              addrAdmin,            qAdmin.data             as PendingSafeTx[] | undefined, sAdmin.data             as SafeInfo | undefined],
  ]

  const merged = new Map<string, RoleTaggedTx>()
  for (const [role, addr, txList, safeInfo] of entries) {
    for (const tx of txList ?? []) {
      if (merged.has(tx.safeTxHash)) continue // deduplicate — first Safe wins
      // Infer the required role from the decoded function; fall back to the fetching role
      const inferredRole = inferRoleFromMethod(tx.dataDecoded?.method) ?? role
      merged.set(tx.safeTxHash, { ...tx, roles: [inferredRole], safeAddress: addr, safeInfo })
    }
  }

  // Sort by nonce ascending so the queue reads naturally
  const txs = Array.from(merged.values()).sort((a, b) => Number(a.nonce) - Number(b.nonce))

  return { txs, isLoading, hasError, refetchAll }
}

// ─── Root client component ────────────────────────────────────────────────────

export default function SafeTxClient({ vaultAssetMap }: { vaultAssetMap: Record<string, string> }) {
  const { txs, isLoading, hasError, refetchAll } = useAllRoleTxs(vaultAssetMap)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {!isLoading && (
            <>
              <span className="font-medium text-neutral-900 dark:text-white">{txs.length}</span>{' '}
              pending transaction{txs.length !== 1 ? 's' : ''} across all roles
            </>
          )}
        </p>
        <button
          onClick={refetchAll}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Refresh all
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      )}

      {/* Error */}
      {hasError && !isLoading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to fetch some pending transactions. Check your Safe configuration.
        </div>
      )}

      {/* Empty */}
      {!isLoading && txs.length === 0 && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-400">No pending Safe transactions.</p>
        </div>
      )}

      {/* Unified list */}
      {!isLoading && txs.length > 0 && (
        <SafeTxList transactions={txs} vaultAssetMap={vaultAssetMap} />
      )}
    </div>
  )
}
