'use client'

import { useRouter } from 'next/navigation'
import { useTransition, useEffect, useState } from 'react'
import {
  formatUpdatedAgo,
  formatV2AutoRefreshLabel,
  V2_AUTO_REFRESH_MS,
} from '@/lib/v2-auto-refresh'

const DEFAULT_AUTO_REFRESH_MS = 60_000

type RefreshStatusLineProps = {
  isRefreshing: boolean
  secondsAgo: number
  autoRefreshMs: number
  isLoading?: boolean
}

export function RefreshStatusLine({
  isRefreshing,
  secondsAgo,
  autoRefreshMs,
  isLoading = false,
}: RefreshStatusLineProps) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
      {isRefreshing ? (
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : !isLoading ? (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
      ) : null}
      {isRefreshing ? 'Updating…' : isLoading ? 'Loading…' : `Updated ${formatUpdatedAgo(secondsAgo)}`}
      <span className="text-neutral-300 dark:text-neutral-600">·</span>
      auto-refresh every {formatV2AutoRefreshLabel(autoRefreshMs)}
    </p>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
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
      className={spinning ? 'animate-spin' : ''}
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}

type Props = {
  onRefresh?: () => void | Promise<unknown>
  onAutoRefresh?: () => void | Promise<unknown>
  autoRefreshMs?: number
  lastUpdatedAt?: number | null
  isRefreshing?: boolean
  isLoading?: boolean
  disableAutoRefresh?: boolean
  size?: 'sm' | 'md'
}

export default function RefreshButton({
  onRefresh,
  onAutoRefresh,
  autoRefreshMs = DEFAULT_AUTO_REFRESH_MS,
  lastUpdatedAt,
  isRefreshing,
  isLoading = false,
  disableAutoRefresh = false,
  size = 'md',
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [, setTick] = useState(0)

  const runRefresh = (manual = true) => {
    const action =
      manual || !onAutoRefresh
        ? onRefresh ?? (() => {
            router.refresh()
          })
        : onAutoRefresh

    return Promise.resolve(action())
  }

  const anchor = lastUpdatedAt ?? lastRefreshed
  const secondsAgo = anchor ? Math.floor((Date.now() - anchor) / 1000) : 0
  const refreshing = isRefreshing ?? isPending

  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (disableAutoRefresh) return

    const id = setInterval(() => {
      startTransition(() => {
        void runRefresh(false)
      })
      if (lastUpdatedAt === undefined) {
        setLastRefreshed(Date.now())
      }
    }, autoRefreshMs)

    return () => clearInterval(id)
  }, [autoRefreshMs, disableAutoRefresh, lastUpdatedAt, onAutoRefresh, onRefresh, router]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClick() {
    startTransition(() => {
      void runRefresh(true)
    })
    if (lastUpdatedAt === undefined) {
      setLastRefreshed(Date.now())
    }
  }

  const buttonClass =
    size === 'sm'
      ? 'flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
      : 'flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white'

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={handleClick} disabled={refreshing} className={buttonClass}>
        <RefreshIcon spinning={refreshing} />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>

      <RefreshStatusLine
        isRefreshing={refreshing}
        secondsAgo={secondsAgo}
        autoRefreshMs={autoRefreshMs}
        isLoading={isLoading}
      />
    </div>
  )
}

export { V2_AUTO_REFRESH_MS }
