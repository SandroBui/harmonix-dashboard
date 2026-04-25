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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          Architecture Status
        </h1>
        <span className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
          {isPending ? (
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          )}
          {isPending ? 'Refreshing…' : `Updated ${secondsAgo}s ago`}
          <span className="text-neutral-300 dark:text-neutral-600">·</span>
          auto-refresh every {AUTO_REFRESH_MS / 1_000}s
        </span>
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          disabled={isPending}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isPending ? 'animate-spin' : ''}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          {isPending ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

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
    </div>
  )
}
