'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAssetMetadata } from '@/lib/hooks/use-asset-metadata'
import { useRoleCheck } from '@/lib/safe/hooks'
import type { SafeInfo } from '@/lib/safe/types'
import FilterBar, { StatusFilter, AssetOption } from './FilterBar'
import FulfillPanel from './FulfillPanel'
import CancelPanel from './CancelPanel'
import type { Withdrawal } from '@/lib/vault-reader'

type WindowMeta = {
  totalQueueLength: string
  fromId: string | null
  toId: string | null
  hasOlder: boolean
  days: number
}

type Props = {
  withdrawals: Withdrawal[]
  vaultAssetMap: Record<string, string>
  windowMeta: WindowMeta
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatUnits(value: string, decimals: number): string {
  const bn = BigInt(value)
  if (bn === 0n) return '0'
  const divisor = 10n ** BigInt(decimals)
  const whole = bn / divisor
  const frac = bn % divisor
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 4)
  return `${whole.toLocaleString()}.${fracStr}`
}

function formatTimestamp(ts: number): string {
  if (ts === 0) return '—'
  return new Date(ts * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1 align-middle text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
      title={copied ? 'Copied!' : 'Copy address'}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  )
}

export default function WithdrawalsClient({ withdrawals, vaultAssetMap, windowMeta }: Props) {
  const router = useRouter()
  const { data: assetMetadata } = useAssetMetadata()

  // Fetch Safe info for the operator role
  const { safeInfo: operatorSafeInfo, hasRole: operatorHasRole } = useRoleCheck('operator')
  const safeInfo = operatorSafeInfo as SafeInfo | undefined
  const [status, setStatus] = useState<StatusFilter>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [controller, setController] = useState('')
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'fulfill' | 'cancel'>('fulfill')
  const [rows, setRows] = useState<Withdrawal[]>(withdrawals)
  const [meta, setMeta] = useState<WindowMeta>(windowMeta)
  const [loadingOlder, setLoadingOlder] = useState(false)

  // Keep local rows/meta in sync when server props change (e.g. after router.refresh / push)
  useEffect(() => {
    setRows(withdrawals)
    setMeta(windowMeta)
  }, [withdrawals, windowMeta])

  function setDays(d: number | 'all') {
    const url = new URL(window.location.href)
    url.searchParams.set('days', String(d))
    url.searchParams.delete('from')
    url.searchParams.delete('to')
    router.push(url.pathname + url.search)
  }

  async function loadOlder() {
    if (!meta.fromId || meta.fromId === '1' || loadingOlder) return
    setLoadingOlder(true)
    try {
      const currentFrom = BigInt(meta.fromId)
      const newTo = currentFrom - 1n
      const newFrom = newTo > 200n ? newTo - 199n : 1n
      const params = new URLSearchParams()
      params.set('from', newFrom.toString())
      params.set('to', newTo.toString())
      const vaultParam = new URL(window.location.href).searchParams.get('vault')
      if (vaultParam) params.set('vault', vaultParam)
      const res = await fetch(`/api/withdrawals?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load older withdrawals')
      const data = await res.json()
      setRows((prev) => [...prev, ...(data.rows as Withdrawal[])])
      setMeta((m) => ({
        ...m,
        fromId: newFrom.toString(),
        hasOlder: newFrom > 1n,
      }))
    } catch (err) {
      console.error('[withdrawals] load older failed', err)
    } finally {
      setLoadingOlder(false)
    }
  }

  const assetOptions = useMemo<AssetOption[]>(() => {
    const seen = new Set<string>()
    const options: AssetOption[] = []
    for (const assetAddr of Object.values(vaultAssetMap)) {
      if (seen.has(assetAddr)) continue
      seen.add(assetAddr)
      const meta = assetMetadata?.[assetAddr]
      options.push({ assetAddress: assetAddr, symbol: meta?.symbol ?? truncateAddress(assetAddr) })
    }
    return options
  }, [vaultAssetMap])

  function handleAssetToggle(assetAddress: string) {
    setSelectedAssets((prev) => {
      const next = new Set(prev)
      if (next.has(assetAddress)) next.delete(assetAddress)
      else next.add(assetAddress)
      return next
    })
  }

  const filtered = useMemo(() => {
    const startTs = startDate ? new Date(startDate).getTime() / 1000 : null
    const endTs = endDate ? new Date(endDate).getTime() / 1000 + 86399 : null
    const controllerQuery = controller.trim().toLowerCase()

    return rows.filter((w) => {
      if (status === 'pending' && w.isFulfilled) return false
      if (status === 'fulfilled' && !w.isFulfilled) return false
      if (startTs !== null && w.requestedAt < startTs) return false
      if (endTs !== null && w.requestedAt > endTs) return false
      if (controllerQuery && !w.controller.includes(controllerQuery)) return false
      if (selectedAssets.size > 0) {
        const assetAddr = vaultAssetMap[w.vault]
        if (!assetAddr || !selectedAssets.has(assetAddr)) return false
      }
      return true
    })
  }, [rows, status, startDate, endDate, controller, selectedAssets, vaultAssetMap])

  // Clear row selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [status, startDate, endDate, controller, selectedAssets])

  // Clear row selection when mode changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [mode])

  // The vault all selected rows must belong to (locked once first row is picked)
  const lockedVault = useMemo(() => {
    if (selectedIds.size === 0) return null
    return filtered.find((w) => selectedIds.has(w.id))?.vault ?? null
  }, [selectedIds, filtered])

  function isSelectable(w: Withdrawal): boolean {
    if (BigInt(w.shares) === 0n) return false
    if (mode === 'fulfill' && w.isFulfilled) return false
    if (lockedVault && w.vault !== lockedVault) return false
    return true
  }

  function toggleRow(w: Withdrawal) {
    if (!isSelectable(w)) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(w.id)) next.delete(w.id)
      else next.add(w.id)
      return next
    })
  }

  const selectedRows = useMemo(
    () => filtered.filter((w) => selectedIds.has(w.id)),
    [filtered, selectedIds],
  )

  const handleFulfillSuccess = useCallback(() => {
    setSelectedIds(new Set())
    router.refresh()
  }, [router])

  const pendingCount = rows.filter((w) => !w.isFulfilled).length
  const fulfilledCount = rows.length - pendingCount

  return (
    // pb-20 leaves room for the sticky FulfillPanel when rows are selected
    <div className={`space-y-4 ${selectedIds.size > 0 ? 'pb-20' : ''}`}>
      <div className="flex items-center gap-1">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={
              meta.days === d
                ? 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }
          >
            {d}d
          </button>
        ))}
        <button
          onClick={() => setDays('all')}
          className={
            meta.days === 0
              ? 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
          }
        >
          All
        </button>
      </div>

      <FilterBar
        status={status}
        onStatusChange={setStatus}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        controller={controller}
        onControllerChange={setController}
        assetOptions={assetOptions}
        selectedAssets={selectedAssets}
        onAssetToggle={handleAssetToggle}
        onClear={() => { setStatus('all'); setStartDate(''); setEndDate(''); setController(''); setSelectedAssets(new Set()) }}
      />

      {/* Action mode toggle */}
      <div className="flex gap-1 rounded-lg border border-neutral-200 p-1 w-fit dark:border-neutral-700">
        <button
          onClick={() => setMode('fulfill')}
          className={
            mode === 'fulfill'
              ? 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
          }
        >
          Fulfill
        </button>
        <button
          onClick={() => setMode('cancel')}
          className={
            mode === 'cancel'
              ? 'rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
          }
        >
          Cancel
        </button>
      </div>

      {/* Summary */}
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        <span className="font-medium text-neutral-900 dark:text-white">{filtered.length}</span> results
        {' · '}
        <span className="font-medium text-yellow-600 dark:text-yellow-400">{pendingCount}</span> pending
        {' · '}
        <span className="font-medium text-green-600 dark:text-green-400">{fulfilledCount}</span> fulfilled
        {' · '}
        <span>
          Showing <b>{rows.length}</b> of <b>{meta.totalQueueLength}</b>
          {meta.fromId && meta.toId && ` (#${meta.fromId} – #${meta.toId})`}
        </span>
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-400">No withdrawals match the current filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-800/50">
                <th className="w-10 px-4 py-3" />
                {['ID', 'Asset', 'Controller', 'Shares', 'Original Shares', 'Assets', 'Original Assets', 'Requested At', 'Status'].map(
                  (col) => (
                    <th
                      key={col}
                      className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400"
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.map((w) => {
                const assetAddr = vaultAssetMap[w.vault]
                const meta = assetAddr ? assetMetadata?.[assetAddr] : undefined
                const selectable = isSelectable(w)
                const checked = selectedIds.has(w.id)

                return (
                  <tr
                    key={w.id}
                    onClick={() => toggleRow(w)}
                    className={[
                      'transition-colors',
                      selectable ? 'cursor-pointer' : 'cursor-default',
                      checked
                        ? 'bg-blue-50 dark:bg-blue-950/30'
                        : selectable
                          // Tier 1 — selectable: full brightness
                          ? 'bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800/50'
                          : BigInt(w.shares) > 0n
                            // Tier 2 — shares > 0, not selectable in this mode: medium dim
                            ? 'bg-white opacity-60 dark:bg-neutral-900'
                            // Tier 3 — shares = 0: most faded
                            : 'bg-white opacity-30 dark:bg-neutral-900',
                    ].join(' ')}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!selectable}
                        onChange={() => toggleRow(w)}
                        className="h-4 w-4 rounded accent-neutral-900 disabled:cursor-not-allowed dark:accent-white"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-500 dark:text-neutral-400">
                      #{w.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                      <span title={assetAddr ?? w.vault}>
                        {meta?.symbol ?? truncateAddress(assetAddr ?? w.vault)}
                      </span>
                      <CopyButton value={assetAddr ?? w.vault} />
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-500 dark:text-neutral-400">
                      <span title={w.controller}>{truncateAddress(w.controller)}</span>
                      <CopyButton value={w.controller} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-white">
                      {formatUnits(w.shares, 18)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                      {w.originalShares === '0' ? '—' : formatUnits(w.originalShares, 18)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-white">
                      {meta ? formatUnits(w.assets, meta.decimals) : w.assets}
                      {meta && (
                        <span className="ml-1 text-neutral-400 dark:text-neutral-500">
                          {meta.symbol}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                      {w.originalAssets === '0'
                        ? '—'
                        : meta
                          ? formatUnits(w.originalAssets, meta.decimals)
                          : w.originalAssets}
                      {w.originalAssets !== '0' && meta && (
                        <span className="ml-1 text-neutral-400 dark:text-neutral-500">
                          {meta.symbol}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                      {formatTimestamp(w.requestedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const shares = BigInt(w.shares)
                        const orig = BigInt(w.originalShares)
                        if (orig > 0n && shares === 0n) {
                          return (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              Completed
                            </span>
                          )
                        }
                        if (orig > 0n && shares > 0n && shares < orig) {
                          return (
                            <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              Partial Claimed
                            </span>
                          )
                        }
                        return w.isFulfilled ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Fulfilled
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                            Pending
                          </span>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta.hasOlder && (
        <div className="flex justify-center pt-2">
          <button
            disabled={loadingOlder}
            onClick={loadOlder}
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {loadingOlder ? 'Loading…' : 'Load older'}
          </button>
        </div>
      )}

      {mode === 'fulfill' && (
        <FulfillPanel
          selected={selectedRows}
          vaultAssetMap={vaultAssetMap}
          safeInfo={safeInfo}
          hasOperatorRole={operatorHasRole}
          onSuccess={handleFulfillSuccess}
        />
      )}
      {mode === 'cancel' && (
        <CancelPanel
          selected={selectedRows}
          safeInfo={safeInfo}
          hasOperatorRole={operatorHasRole}
          onSuccess={handleFulfillSuccess}
        />
      )}
    </div>
  )
}
