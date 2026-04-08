'use client'

import { useEffect, useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useRoleCheck } from '@/lib/safe/hooks'
import type { NavPageData } from '@/lib/nav-reader'
import RoleBanner from './RoleBanner'
import NavSummaryCards from './NavSummaryCards'
import UpdateNavSection from './UpdateNavSection'
import AssetNavBreakdown from './AssetNavBreakdown'

const AUTO_REFRESH_MS = 60_000

export default function NavClient({ data }: { data: NavPageData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [secondsAgo, setSecondsAgo] = useState(0)
  const { isConnected } = useAccount()

  // ── Auto-refresh ──────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      startTransition(() => router.refresh())
    }, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [router])

  // Tick the "X seconds ago" counter, reset to 0 when new data arrives
  useEffect(() => {
    setSecondsAgo(0)
    const ticker = setInterval(() => setSecondsAgo((s) => s + 1), 1_000)
    return () => clearInterval(ticker)
  }, [data.fetchedAt])

  // ── Role checks ──────────────────────────────────────────────────────────
  const operator = useRoleCheck('operator')
  const admin = useRoleCheck('admin')

  const roles = {
    isConnected,
    isSafeOwner: operator.isSafeOwner || admin.isSafeOwner,
    safeHasOperator: operator.hasRole,
    safeHasAdmin: admin.hasRole,
  }

  return (
    <div className="space-y-6">

      {/* Page title + refresh controls */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          NAV Management
        </h1>
        <div className="ml-auto flex flex-col items-end gap-1">
          <button
            onClick={() => startTransition(() => router.refresh())}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14" height="14"
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
          <p className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            {isPending ? (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            )}
            {isPending ? 'Updating…' : `Updated ${secondsAgo}s ago`}
            <span className="text-neutral-300 dark:text-neutral-600">·</span>
            auto-refresh every {AUTO_REFRESH_MS / 1_000}s
          </p>
        </div>
      </div>

      {/* Role / access indicator */}
      <RoleBanner
        isConnected={isConnected}
        isSafeOwner={roles.isSafeOwner}
        safeHasOperator={roles.safeHasOperator}
        safeHasAdmin={roles.safeHasAdmin}
        operatorSafe={operator.safeAddress}
        adminSafe={admin.safeAddress}
      />

      {/* NAV summary cards */}
      <NavSummaryCards data={data} />

      {/* Update NAV action */}
      <UpdateNavSection
        data={data}
        canPropose={operator.canPropose}
        isConnected={isConnected}
      />

      {/* Per-asset breakdown */}
      <AssetNavBreakdown data={data} roles={roles} />
    </div>
  )
}
