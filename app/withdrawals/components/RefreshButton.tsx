'use client'

import { useRouter } from 'next/navigation'
import { useTransition, useEffect, useState } from 'react'

export default function RefreshButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [secondsAgo, setSecondsAgo] = useState(0)

  // Tick the "X ago" counter every second
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshed) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [lastRefreshed])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => router.refresh())
      setLastRefreshed(Date.now())
    }, 60_000)
    return () => clearInterval(id)
  }, [router])

  function handleClick() {
    startTransition(() => router.refresh())
    setLastRefreshed(Date.now())
  }

  function formatAgo(s: number): string {
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
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

      <p className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
        {isPending ? 'Updating…' : `Updated ${formatAgo(secondsAgo)}`}
        <span className="text-neutral-300 dark:text-neutral-600">·</span>
        auto-refresh every 60s
      </p>
    </div>
  )
}
