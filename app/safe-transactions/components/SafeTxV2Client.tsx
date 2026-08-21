'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  useSingleSafeMultisigTxs,
  useSingleSafePendingTxs,
  MULTISIG_PAGE_SIZE,
  type SafeTxTagging,
} from '@/lib/safe/hooks'
import { getSafeChainLabel, safeAppQueueUrl } from '@/lib/safe/chains'
import { inferV2RoleFromMethod } from '@/lib/safe/v2-safes'
import { getVaultSafeOptions } from '@/lib/safe/vault-safes'
import { useVaultConfig } from '@/lib/vault-context'
import SafeTxList from './SafeTxList'
import SafeTxLifecycleTabs, { type SafeTxLifecycleTab } from './SafeTxLifecycleTabs'
import SafeWalletSelect from './SafeWalletSelect'
import { useSafeSelection } from './use-safe-selection'

const EMPTY_MESSAGES: Record<SafeTxLifecycleTab, string> = {
  pending: 'No pending Safe transactions.',
  history: 'No Safe multisig transactions.',
}

const INITIAL_TAB_PAGES: Record<SafeTxLifecycleTab, number> = {
  pending: 1,
  history: 1,
}

export default function SafeTxV2Client({ vaultAssetMap }: { vaultAssetMap: Record<string, string> }) {
  const config = useVaultConfig()
  const safeOptions = useMemo(() => getVaultSafeOptions(config), [config])
  const [selectedSafe, setSelectedSafe] = useSafeSelection(config.slug, safeOptions)
  const [activeTab, setActiveTab] = useState<SafeTxLifecycleTab>('pending')
  const [pages, setPages] = useState(INITIAL_TAB_PAGES)

  const selectedOption = selectedSafe === null ? undefined : safeOptions[selectedSafe]
  const safeAddress = selectedOption?.address
  const safeChainId = selectedOption?.chainId ?? config.chainId
  useEffect(() => {
    setPages(INITIAL_TAB_PAGES)
  }, [safeAddress, safeChainId])
  // Signing needs the wallet, the Protocol Kit and the vault reads on one chain,
  // so Safes configured on another chain stay read-only here.
  const isOffVaultChain = safeChainId !== config.chainId
  const tagging = useMemo<SafeTxTagging>(
    () => ({ role: selectedOption?.role ?? null, inferRole: inferV2RoleFromMethod }),
    [selectedOption],
  )

  const pending = useSingleSafePendingTxs(safeAddress, vaultAssetMap, tagging, {
    chainId: safeChainId,
    limit: pages.pending * MULTISIG_PAGE_SIZE,
  })
  const history = useSingleSafeMultisigTxs(safeAddress, vaultAssetMap, tagging, {
    limit: pages.history * MULTISIG_PAGE_SIZE,
    ordering: '-modified',
    enabled: activeTab === 'history',
    chainId: safeChainId,
  })

  const views = { pending, history }
  const active = views[activeTab]

  function handleTabChange(tab: SafeTxLifecycleTab) {
    setActiveTab(tab)
  }

  const count = active.txs.length
  const plural = count === 1 ? '' : 's'
  const subtitle =
    activeTab === 'pending'
      ? `pending transaction${plural}`
      : `transaction${plural} in history`

  return (
    <div className="space-y-4">
      <SafeTxLifecycleTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        pendingCount={pending.count}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {selectedOption && !active.isLoading && (
            <>
              <span className="font-medium text-neutral-900 dark:text-white">{count}</span>{' '}
              {subtitle} on {selectedOption.label}
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          <SafeWalletSelect
            options={safeOptions}
            value={selectedSafe}
            vaultChainId={config.chainId}
            onChange={(value) => {
              setSelectedSafe(value)
              setPages(INITIAL_TAB_PAGES)
            }}
          />
          <button
            type="button"
            onClick={() => active.refetch()}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {isOffVaultChain && selectedOption && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {selectedOption.label} lives on {getSafeChainLabel(safeChainId)}, not{' '}
          {getSafeChainLabel(config.chainId)} — transactions are read-only here.{' '}
          <a
            href={safeAppQueueUrl(safeChainId, selectedOption.address) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            Sign or execute in the Safe app
          </a>
          .
        </div>
      )}

      {active.isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      )}

      {active.hasError && !active.isLoading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to fetch Safe transactions. Check your Safe configuration and Transaction Service.
        </div>
      )}

      {!active.isLoading && active.txs.length === 0 && !active.hasError && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-400">
            {selectedOption
              ? EMPTY_MESSAGES[activeTab]
              : 'No Safe wallet configured for this vault.'}
          </p>
        </div>
      )}

      {!active.isLoading && active.txs.length > 0 && (
        <SafeTxList
          transactions={active.txs}
          vaultAssetMap={vaultAssetMap}
          mode={activeTab === 'pending' && !isOffVaultChain ? 'pending' : 'readonly'}
          chainId={safeChainId}
        />
      )}

      {active.isFetchingMore && (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      )}

      {active.hasMore && !active.isLoading && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={active.isFetchingMore}
            onClick={() => setPages((current) => ({ ...current, [activeTab]: current[activeTab] + 1 }))}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {active.isFetchingMore && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {active.isFetchingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
