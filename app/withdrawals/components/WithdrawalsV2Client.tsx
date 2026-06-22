'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import CopyButton from '@/app/components/CopyButton'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import {
  WITHDRAWALS_V2_PAGE_SIZE,
  type WithdrawalsV2Data,
  type WithdrawalV2Entry,
} from '@/lib/withdrawals-v2-reader'
import { useFulfillmentStatus } from '@/lib/hooks/use-fulfillment-status'
import RefreshButton from './RefreshButton'
import WithdrawalsAcquirePanel from './WithdrawalsAcquirePanel'

const DAY_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 15, label: '15d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 0, label: 'All' },
] as const

const SLOW_DAY_VALUES = new Set<number>([90, 0])

type StatusFilter = 'all' | 'pending' | 'completed'

type Props = {
  vaultSlug: string
  vaultName: string
  days: number
  underlyingSymbol: string
  underlyingDecimals: number
  fundContractAddress: string
  balanceContractAddress: string
  fulfillmentSeconds: number
}

function isSelectableEntry(entry: WithdrawalV2Entry): boolean {
  return entry.isPending && !entry.canCompleteWithdraw
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function TxLink({ label, hash }: { label: string; hash: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {label}
      </span>
      <Link
        href={`https://hyperevmscan.io/tx/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
        title={hash}
      >
        {truncateAddress(hash)}
      </Link>
    </div>
  )
}

function TxLinksCell({ entry }: { entry: WithdrawalV2Entry }) {
  return (
    <div className="flex flex-col gap-1">
      <TxLink label="Init" hash={entry.initTxHash} />
      {entry.acquireTxHash && <TxLink label="Acquire" hash={entry.acquireTxHash} />}
      {entry.completionTxHash && <TxLink label="Redeem" hash={entry.completionTxHash} />}
    </div>
  )
}

function StatusBadge({
  entry,
  fulfillmentSeconds,
}: {
  entry: WithdrawalV2Entry
  fulfillmentSeconds: number
}) {
  const isYellowPending = entry.isPending && !entry.canCompleteWithdraw
  const { label: timeLeft, overdue } = useFulfillmentStatus(
    entry.requestedAt,
    fulfillmentSeconds,
    !isYellowPending,
  )

  if (!entry.isPending) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Completed
      </span>
    )
  }
  if (entry.canCompleteWithdraw) {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
        Ready to Withdraw
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      Pending
      {timeLeft && (
        <span
          className={
            overdue
              ? 'ml-1.5 font-semibold text-red-600 dark:text-red-400'
              : 'ml-1.5 text-yellow-700/70 dark:text-yellow-400/70'
          }
        >
          · {timeLeft}
        </span>
      )}
    </span>
  )
}

export default function WithdrawalsV2Client({
  vaultSlug,
  vaultName,
  days,
  underlyingSymbol,
  underlyingDecimals,
  fundContractAddress,
  balanceContractAddress,
  fulfillmentSeconds,
}: Props) {
  const router = useRouter()
  const [data, setData] = useState<WithdrawalsV2Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [controller, setController] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDaysConfirm, setPendingDaysConfirm] = useState<number | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    params.set('vault', vaultSlug)
    params.set('days', days > 0 ? String(days) : 'all')

    const res = await fetch(`/api/withdrawals/v2?${params.toString()}`, { cache: 'no-store' })
    const json = (await res.json()) as { data?: WithdrawalsV2Data; error?: string }

    if (!res.ok) {
      throw new Error(json.error ?? `Withdrawals request failed (${res.status})`)
    }
    if (!json.data) {
      throw new Error('Withdrawals response missing data')
    }
    if (json.data.error) {
      throw new Error(json.data.error)
    }

    return json.data
  }, [vaultSlug, days])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    load()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load withdrawals')
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [load])

  function setDays(nextDays: number) {
    const url = new URL(window.location.href)
    url.searchParams.set('days', nextDays > 0 ? String(nextDays) : 'all')
    router.push(url.pathname + url.search)
  }

  function handleDayClick(nextDays: number) {
    if (nextDays === days) return
    if (SLOW_DAY_VALUES.has(nextDays)) {
      setPendingDaysConfirm(nextDays)
      return
    }
    setDays(nextDays)
  }

  function confirmSlowDayRange() {
    if (pendingDaysConfirm === null) return
    setDays(pendingDaysConfirm)
    setPendingDaysConfirm(null)
  }

  function cancelSlowDayRange() {
    setPendingDaysConfirm(null)
  }

  const filtered = useMemo(() => {
    const entries = data?.entries ?? []
    const query = controller.trim().toLowerCase()

    return entries.filter((entry) => {
      if (status === 'pending' && !entry.isPending) return false
      if (status === 'completed' && entry.isPending) return false
      if (query && !entry.controller.includes(query)) return false
      return true
    })
  }, [data?.entries, status, controller])

  const totalPages = Math.max(1, Math.ceil(filtered.length / WITHDRAWALS_V2_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const paginated = useMemo(() => {
    const start = (safePage - 1) * WITHDRAWALS_V2_PAGE_SIZE
    return filtered.slice(start, start + WITHDRAWALS_V2_PAGE_SIZE)
  }, [filtered, safePage])

  useEffect(() => {
    setPage(1)
  }, [status, controller, days, data?.fetchedAt])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [status, controller, days])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const selectedRows = useMemo(
    () => filtered.filter((entry) => selectedIds.has(entry.initTxHash)),
    [filtered, selectedIds],
  )

  const selectableOnPage = useMemo(
    () => paginated.filter(isSelectableEntry),
    [paginated],
  )

  const allPageSelected =
    selectableOnPage.length > 0 &&
    selectableOnPage.every((entry) => selectedIds.has(entry.initTxHash))

  function toggleRow(entry: WithdrawalV2Entry) {
    if (!isSelectableEntry(entry)) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(entry.initTxHash)) next.delete(entry.initTxHash)
      else next.add(entry.initTxHash)
      return next
    })
  }

  function toggleAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const entry of selectableOnPage) next.delete(entry.initTxHash)
      } else {
        for (const entry of selectableOnPage) next.add(entry.initTxHash)
      }
      return next
    })
  }

  const handleAcquireSuccess = useCallback(async () => {
    setSelectedIds(new Set())
    try {
      const result = await load()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh withdrawals')
    }
  }, [load])

  const rangeStart =
    filtered.length === 0 ? 0 : (safePage - 1) * WITHDRAWALS_V2_PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * WITHDRAWALS_V2_PAGE_SIZE, filtered.length)

  const handleRefresh = useCallback(async () => {
    try {
      const result = await load()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh withdrawals')
    }
  }, [load])

  return (
    <div className={`space-y-4 ${selectedIds.size > 0 ? 'pb-44' : ''}`}>
      {pendingDaysConfirm !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="slow-range-title"
        >
          <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <h3
              id="slow-range-title"
              className="text-lg font-semibold text-neutral-900 dark:text-white"
            >
              Large date range
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Loading{' '}
              {pendingDaysConfirm === 0 ? 'all withdrawal history' : 'the last 90 days of withdrawals'}{' '}
              may take a few minutes while the data is being retrieved. Would you like to continue?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelSlowDayRange}
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSlowDayRange}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Withdrawals</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {vaultName} · Initiated withdrawals from Etherscan (not yet redeemed or withdrawn)
          </p>
        </div>
        {data && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-sm font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {data.pendingCount} pending / {data.entries.length} total
          </span>
        )}
        <div className="ml-auto">
          <RefreshButton onRefresh={handleRefresh} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {DAY_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => handleDayClick(opt.value)}
            className={
              days === opt.value
                ? 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
          {(
            [
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'completed', label: 'Completed' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={[
                'rounded px-3 py-1 text-sm font-medium transition-colors',
                status === opt.value
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-500 dark:text-neutral-400">User</label>
          <input
            type="text"
            value={controller}
            onChange={(e) => setController(e.target.value)}
            placeholder="0x… or partial"
            spellCheck={false}
            className="w-56 rounded border border-neutral-200 bg-white px-2 py-1 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
        </div>
      </div>

      {data && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-900 dark:text-white">{filtered.length}</span> results
          {' · '}
          <span className="font-medium text-yellow-600 dark:text-yellow-400">{data.pendingCount}</span>{' '}
          pending
          {' · '}
          <span className="font-medium text-green-600 dark:text-green-400">{data.completedCount}</span>{' '}
          completed
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
          <table className="w-full text-sm">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-400">No withdrawals match the current filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-800/50">
                <th className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    disabled={selectableOnPage.length === 0}
                    onChange={toggleAllOnPage}
                    aria-label="Select all pending withdrawals on this page"
                    className="h-4 w-4 rounded accent-neutral-900 disabled:cursor-not-allowed dark:accent-white"
                  />
                </th>
                {[
                  'User',
                  'Shares',
                  'Withdraw Amount',
                  'Initiated At',
                  'Status',
                  'Tx',
                ].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {paginated.map((entry) => {
                const selectable = isSelectableEntry(entry)
                const checked = selectedIds.has(entry.initTxHash)
                return (
                <tr
                  key={entry.initTxHash}
                  onClick={() => toggleRow(entry)}
                  className={[
                    selectable ? 'cursor-pointer' : 'cursor-default',
                    checked
                      ? 'bg-blue-50 dark:bg-blue-950/30'
                      : 'bg-white dark:bg-neutral-900',
                    !selectable && entry.isPending ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!selectable}
                      onChange={() => toggleRow(entry)}
                      aria-label={`Select withdrawal for ${entry.controller}`}
                      className="h-4 w-4 rounded accent-neutral-900 disabled:cursor-not-allowed dark:accent-white"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-600 dark:text-neutral-300">
                    <span title={entry.controller}>{truncateAddress(entry.controller)}</span>
                    <CopyButton value={entry.controller} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-white">
                    {formatTokenAmount(entry.shares, 18, 4)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                    {entry.withdrawAmount === '0'
                      ? '—'
                      : `${formatTokenAmount(entry.withdrawAmount, underlyingDecimals, 4)} ${underlyingSymbol}`}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                    {formatTime(entry.requestedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge entry={entry} fulfillmentSeconds={fulfillmentSeconds} />
                  </td>
                  <td className="px-4 py-3">
                    <TxLinksCell entry={entry} />
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Showing {rangeStart}–{rangeEnd} of {filtered.length.toLocaleString()}
            {status !== 'all' ? ` (${status})` : ''}
            {controller.trim() ? ` · user contains "${controller.trim()}"` : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
            >
              Previous
            </button>
            <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Pending = user has locked shares and{' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">canCompleteWithdraw()</code>{' '}
        is false. Ready to Withdraw ={' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">canCompleteWithdraw()</code>{' '}
        is true. Select pending rows (yellow) to batch acquire below.
      </p>

      <WithdrawalsAcquirePanel
        selected={selectedRows}
        fundContractAddress={fundContractAddress}
        balanceContractAddress={balanceContractAddress}
        underlyingSymbol={underlyingSymbol}
        underlyingDecimals={underlyingDecimals}
        onSuccess={handleAcquireSuccess}
      />
    </div>
  )
}
