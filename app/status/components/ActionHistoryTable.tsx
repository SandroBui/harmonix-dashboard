'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ACTION_HISTORY_PAGE_SIZE,
  type ActionHistoryData,
  type ActionHistoryEntry,
  type ActionType,
} from '@/lib/action-history-reader'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'

const ACTION_LABELS: Record<ActionType, string> = {
  deposit: 'Deposit',
  redeem: 'Redeem',
  initiateWithdrawal: 'Init Withdraw',
  updateNav: 'Update NAV',
  harvestPerformanceFee: 'Harvest Perf Fee',
  harvestManagementFee: 'Harvest Mgmt Fee',
}

const ACTION_COLORS: Record<ActionType, string> = {
  deposit: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400',
  redeem: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400',
  initiateWithdrawal: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400',
  updateNav: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-400',
  harvestPerformanceFee: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400',
  harvestManagementFee: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400',
}

const FILTER_OPTIONS: Array<ActionType | 'all'> = [
  'all',
  'deposit',
  'redeem',
  'initiateWithdrawal',
  'updateNav',
  'harvestPerformanceFee',
  'harvestManagementFee',
]

const ADDRESS_FILTER_DEBOUNCE_MS = 300

type Props = {
  history: ActionHistoryData | null
  isLoading?: boolean
  isRefreshing?: boolean
  underlyingSymbol: string
  underlyingDecimals: number
  days: number
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800">
          {Array.from({ length: 5 }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function AddressCell({ address }: { address: string }) {
  return (
    <span className="inline-flex items-center font-mono text-xs">
      {truncateAddress(address)}
      <CopyButton value={address} />
    </span>
  )
}

function normalizeAddressQuery(query: string): string {
  return query.trim().toLowerCase().replace(/^0x/, '')
}

function entryMatchesAddress(entry: ActionHistoryEntry, query: string): boolean {
  const needle = normalizeAddressQuery(query)
  if (!needle) return true

  const primary = entry.primaryAddress.toLowerCase().replace(/^0x/, '')
  const secondary = entry.secondaryAddress?.toLowerCase().replace(/^0x/, '') ?? ''
  return primary.includes(needle) || secondary.includes(needle)
}

function formatAmount(entry: ActionHistoryEntry, underlyingSymbol: string, underlyingDecimals: number): string {
  switch (entry.action) {
    case 'deposit':
      return `${formatTokenAmount(entry.amount, underlyingDecimals, 4)} ${underlyingSymbol}`
    case 'initiateWithdrawal':
      return `${formatTokenAmount(entry.amount, underlyingDecimals, 4)} ${underlyingSymbol} min out`
    case 'redeem':
      return entry.shares
        ? `${formatTokenAmount(entry.shares, 18, 4)} shares`
        : '—'
    case 'updateNav':
    case 'harvestPerformanceFee':
    case 'harvestManagementFee':
      return '—'
    default:
      return '—'
  }
}

function EntryRow({
  entry,
  underlyingSymbol,
  underlyingDecimals,
}: {
  entry: ActionHistoryEntry
  underlyingSymbol: string
  underlyingDecimals: number
}) {
  const amountLabel = formatAmount(entry, underlyingSymbol, underlyingDecimals)

  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800">
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-600 dark:text-neutral-400">
        {formatTime(entry.timestamp)}
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[entry.action]}`}
        >
          {ACTION_LABELS[entry.action]}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <AddressCell address={entry.primaryAddress} />
        {entry.secondaryAddress && (
          <span className="mt-0.5 block text-xs text-neutral-400">
            → <AddressCell address={entry.secondaryAddress} />
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-neutral-700 dark:text-neutral-300">
        {amountLabel}
        {entry.shares && entry.action === 'deposit' && (
          <span className="block text-neutral-400">
            min {formatTokenAmount(entry.shares, 18, 4)} shares
          </span>
        )}
        {entry.shares && entry.action === 'initiateWithdrawal' && (
          <span className="block text-neutral-400">
            {formatTokenAmount(entry.shares, 18, 4)} shares
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <a
          href={`https://hyperevmscan.io/tx/${entry.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          {truncateAddress(entry.txHash)}
        </a>
      </td>
    </tr>
  )
}

export default function ActionHistoryTable({
  history,
  isLoading = false,
  isRefreshing = false,
  underlyingSymbol,
  underlyingDecimals,
  days,
}: Props) {
  const [filter, setFilter] = useState<ActionType | 'all'>('all')
  const [addressQuery, setAddressQuery] = useState('')
  const [debouncedAddressQuery, setDebouncedAddressQuery] = useState('')
  const [page, setPage] = useState(1)

  const entries = history?.entries ?? []
  const trimmedAddressQuery = addressQuery.trim()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAddressQuery(trimmedAddressQuery)
    }, ADDRESS_FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [trimmedAddressQuery])

  const filtered = useMemo(() => {
    let result = entries
    if (filter !== 'all') {
      result = result.filter((e) => e.action === filter)
    }
    if (debouncedAddressQuery) {
      result = result.filter((e) => entryMatchesAddress(e, debouncedAddressQuery))
    }
    return result
  }, [entries, filter, debouncedAddressQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ACTION_HISTORY_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const paginated = useMemo(() => {
    const start = (safePage - 1) * ACTION_HISTORY_PAGE_SIZE
    return filtered.slice(start, start + ACTION_HISTORY_PAGE_SIZE)
  }, [filtered, safePage])

  useEffect(() => {
    setPage(1)
  }, [filter, debouncedAddressQuery, history?.fetchedAt, days])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const windowLabel = days > 0 ? `last ${days} days` : 'all time'
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * ACTION_HISTORY_PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * ACTION_HISTORY_PAGE_SIZE, filtered.length)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Action History</h2>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">{windowLabel}</span>
        {isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Loading from Etherscan…
          </span>
        )}
        {!isLoading && isRefreshing && (
          <span className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Updating…
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={isLoading || isRefreshing}
              onClick={() => setFilter(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                filter === key
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
              }`}
            >
              {key === 'all' ? 'All' : ACTION_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="action-history-address-filter" className="text-xs text-neutral-500 dark:text-neutral-400">
          Address contains
        </label>
        <input
          id="action-history-address-filter"
          type="text"
          value={addressQuery}
          onChange={(e) => setAddressQuery(e.target.value)}
          placeholder="e.g. 3Aa3 or fde5"
          disabled={isLoading}
          spellCheck={false}
          autoComplete="off"
          className="min-w-[12rem] flex-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500"
        />
        {trimmedAddressQuery && (
          <button
            type="button"
            onClick={() => {
              setAddressQuery('')
              setDebouncedAddressQuery('')
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {history?.error && !isLoading && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
          {history.error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50">
            <tr>
              {['Time', 'Action', 'Address', 'Amount', 'Tx'].map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
            {isLoading ? (
              <LoadingRows />
            ) : paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-neutral-400 dark:text-neutral-500"
                >
                  {history?.error
                    ? 'No action history available.'
                    : debouncedAddressQuery
                      ? 'No actions match this address filter.'
                      : filter !== 'all'
                        ? 'No actions found for this action type.'
                        : 'No actions found for this period.'}
                </td>
              </tr>
            ) : (
              paginated.map((entry) => (
                <EntryRow
                  key={`${entry.txHash}-${entry.logIndex}`}
                  entry={entry}
                  underlyingSymbol={underlyingSymbol}
                  underlyingDecimals={underlyingDecimals}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && !isRefreshing && filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Showing {rangeStart}–{rangeEnd} of {filtered.length.toLocaleString()}
            {filter !== 'all' ? ` (${ACTION_LABELS[filter]})` : ''}
            {debouncedAddressQuery ? ` · address contains "${debouncedAddressQuery}"` : ''}
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
    </div>
  )
}
