'use client'

import { useV2PendingSafeTransactions } from '@/lib/safe/hooks'
import SafeTxList from './SafeTxList'

export default function SafeTxV2Client({ vaultAssetMap }: { vaultAssetMap: Record<string, string> }) {
  const { data: txs = [], isLoading, isError, refetch } = useV2PendingSafeTransactions(vaultAssetMap)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {!isLoading && (
            <>
              <span className="font-medium text-neutral-900 dark:text-white">{txs.length}</span>{' '}
              pending transaction{txs.length !== 1 ? 's' : ''} across configured Safes
            </>
          )}
        </p>
        <button
          onClick={() => refetch()}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Refresh all
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to fetch pending transactions. Check your Safe configuration.
        </div>
      )}

      {!isLoading && txs.length === 0 && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-400">No pending Safe transactions.</p>
        </div>
      )}

      {!isLoading && txs.length > 0 && (
        <SafeTxList transactions={txs} vaultAssetMap={vaultAssetMap} />
      )}
    </div>
  )
}
