'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ActionHistoryData } from '@/lib/action-history-reader'
import type { FundStatusV2Data } from '@/lib/status-v2-reader'
import VaultStatusV2Cards from './VaultStatusV2Cards'
import ActionHistoryTable from './ActionHistoryTable'
import RefreshButton from '@/app/withdrawals/components/RefreshButton'
import { V2_AUTO_REFRESH_MS } from '@/lib/v2-auto-refresh'
const DAY_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 0, label: 'All' },
]

type Props = {
  vaultSlug: string
  vaultName: string
  days: number
}

export default function StatusV2Client({ vaultSlug, vaultName, days }: Props) {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<FundStatusV2Data | null>(null)
  const [history, setHistory] = useState<ActionHistoryData | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [statusRefreshing, setStatusRefreshing] = useState(false)
  const [historyRefreshing, setHistoryRefreshing] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const statusRef = useRef(status)
  const historyRef = useRef(history)

  statusRef.current = status
  historyRef.current = history

  const loadStatus = useCallback(async () => {
    const params = new URLSearchParams()
    params.set('vault', vaultSlug)

    const res = await fetch(`/api/status/v2?${params.toString()}`, { cache: 'no-store' })
    const json = (await res.json()) as { status?: FundStatusV2Data; error?: string }

    if (!res.ok) {
      throw new Error(json.error ?? `Status request failed (${res.status})`)
    }
    if (!json.status) {
      throw new Error('Status response missing data')
    }

    return json.status
  }, [vaultSlug])

  const loadHistory = useCallback(async () => {
    const params = new URLSearchParams()
    params.set('vault', vaultSlug)
    params.set('days', days > 0 ? String(days) : 'all')

    const res = await fetch(`/api/status/v2/history?${params.toString()}`, { cache: 'no-store' })
    const json = (await res.json()) as { history?: ActionHistoryData; error?: string }

    if (!res.ok) {
      throw new Error(json.error ?? `History request failed (${res.status})`)
    }
    if (!json.history) {
      throw new Error('History response missing data')
    }

    return json.history
  }, [vaultSlug, days])

  const refreshStatus = useCallback(
    async (background = false) => {
      const hasData = statusRef.current !== null
      if (background && hasData) setStatusRefreshing(true)
      else setStatusLoading(true)

      try {
        const nextStatus = await loadStatus()
        setStatus(nextStatus)
        setStatusError(null)
        setLastUpdatedAt(Date.now())
      } catch (err) {
        setStatusError(
          err instanceof Error ? err.message : 'Failed to load vault status',
        )
      } finally {
        setStatusLoading(false)
        setStatusRefreshing(false)
      }
    },
    [loadStatus],
  )

  const refreshHistory = useCallback(
    async (background = false) => {
      const hasData = historyRef.current !== null
      if (background && hasData) setHistoryRefreshing(true)
      else setHistoryLoading(true)

      try {
        const nextHistory = await loadHistory()
        setHistory(nextHistory)
        setHistoryError(null)
        setLastUpdatedAt(Date.now())
      } catch (err) {
        setHistoryError(
          err instanceof Error ? err.message : 'Failed to load action history',
        )
      } finally {
        setHistoryLoading(false)
        setHistoryRefreshing(false)
      }
    },
    [loadHistory],
  )

  useEffect(() => {
    setStatus(null)
    setStatusError(null)
  }, [vaultSlug])

  useEffect(() => {
    setHistory(null)
    setHistoryError(null)
  }, [days, vaultSlug])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  function buildDaysHref(nextDays: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (nextDays > 0) {
      params.set('days', String(nextDays))
    } else {
      params.set('days', 'all')
    }
    return `/status?${params.toString()}`
  }

  const underlyingSymbol = status?.underlyingSymbol ?? 'TOKEN'
  const underlyingDecimals = status?.underlyingDecimals ?? 18
  const isPageRefreshing = statusRefreshing || historyRefreshing

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          {vaultName} Status
        </h1>
        <div className="ml-auto">
          <RefreshButton
            autoRefreshMs={V2_AUTO_REFRESH_MS}
            onRefresh={() => {
              void Promise.all([refreshStatus(true), refreshHistory(true)])
            }}
            isRefreshing={isPageRefreshing}
            lastUpdatedAt={lastUpdatedAt}
            isLoading={lastUpdatedAt === null}
          />
        </div>
      </div>

      {statusError && !statusLoading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load vault status: {statusError}
        </div>
      )}

      <VaultStatusV2Cards
        status={status}
        isLoading={statusLoading && !status}
        isRefreshing={statusRefreshing}
      />

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">History window:</span>
          {DAY_OPTIONS.map(({ value, label }) => (
            <Link
              key={label}
              href={buildDaysHref(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                days === value
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        {historyError && !historyLoading && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            Failed to load action history: {historyError}
          </div>
        )}
        <ActionHistoryTable
          history={history}
          isLoading={historyLoading && !history}
          isRefreshing={historyRefreshing}
          underlyingSymbol={underlyingSymbol}
          underlyingDecimals={underlyingDecimals}
          days={days}
        />
      </div>
    </div>
  )
}
