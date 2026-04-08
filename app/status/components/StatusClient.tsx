'use client'

import { useEffect, useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FundStatusData } from '@/lib/status-reader'
import PausedVaultAlert from './PausedVaultAlert'
import FundSummaryCards from './FundSummaryCards'
import WithdrawalQueueSummary from './WithdrawalQueueSummary'
import VaultCard from './VaultCard'

const AUTO_REFRESH_MS = 30_000

export default function StatusClient({ data }: { data: FundStatusData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [secondsAgo, setSecondsAgo] = useState(0)

  // Auto-refresh every 30 s by re-running the server component
  useEffect(() => {
    const interval = setInterval(() => {
      startTransition(() => router.refresh())
    }, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [router])

  // Reset the "X seconds ago" ticker whenever fresh data arrives
  useEffect(() => {
    setSecondsAgo(0)
    const ticker = setInterval(() => setSecondsAgo((s) => s + 1), 1_000)
    return () => clearInterval(ticker)
  }, [data.fetchedAt])

  return (
    <div className="space-y-6">
      <PausedVaultAlert vaults={data.vaults} />

      <FundSummaryCards
        navSnapshot={data.navSnapshot}
        pricePerShare={data.pricePerShare}
        vaults={data.vaults}
      />

      <WithdrawalQueueSummary
        queueLength={data.redeemQueueLength}
        redeemMode={data.redeemMode}
        vaults={data.vaults}
        redeemActiveCount={data.redeemActiveCount}
        redeemFulfilledCount={data.redeemFulfilledCount}
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
          Per-Vault Breakdown
        </h2>
        <div className="space-y-4">
          {data.vaults.map((vault) => (
            <VaultCard key={vault.vault} vault={vault} />
          ))}
          {data.vaults.length === 0 && (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
              <p className="text-sm text-neutral-400">No registered vaults found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Freshness footer */}
      <div className="flex items-center gap-2 border-t border-neutral-100 pt-4 text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
        {isPending ? (
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        )}
        <span>
          {isPending ? 'Refreshing…' : `Updated ${secondsAgo}s ago`}
          {' · '}
          auto-refresh every {AUTO_REFRESH_MS / 1_000}s
        </span>
      </div>
    </div>
  )
}
