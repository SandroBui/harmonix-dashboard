'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ASSET_METADATA } from '@/lib/contracts'
import { useRoleCheck } from '@/lib/safe/hooks'
import type { SafeInfo } from '@/lib/safe/types'
import FilterBar, { StatusFilter, AssetOption } from './FilterBar'
import FulfillPanel from './FulfillPanel'
import CancelPanel from './CancelPanel'
import type { Withdrawal } from '@/lib/vault-reader'

type Props = {
  withdrawals: Withdrawal[]
  vaultAssetMap: Record<string, string>
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

export default function WithdrawalsClient({ withdrawals, vaultAssetMap }: Props) {
  const router = useRouter()

  // Fetch Safe info for the operator role
  const { safeInfo: operatorSafeInfo, safeAddress: operatorSafeAddress } = useRoleCheck('operator')
  const safeInfo = operatorSafeInfo as SafeInfo | undefined
  const [status, setStatus] = useState<StatusFilter>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'fulfill' | 'cancel'>('fulfill')

  const assetOptions = useMemo<AssetOption[]>(() => {
    const seen = new Set<string>()
    const options: AssetOption[] = []
    for (const assetAddr of Object.values(vaultAssetMap)) {
      if (seen.has(assetAddr)) continue
      seen.add(assetAddr)
      const meta = ASSET_METADATA[assetAddr]
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

    return withdrawals.filter((w) => {
      if (status === 'pending' && w.isFulfilled) return false
      if (status === 'fulfilled' && !w.isFulfilled) return false
      if (startTs !== null && w.requestedAt < startTs) return false
      if (endTs !== null && w.requestedAt > endTs) return false
      if (selectedAssets.size > 0) {
        const assetAddr = vaultAssetMap[w.vault]
        if (!assetAddr || !selectedAssets.has(assetAddr)) return false
      }
      return true
    })
  }, [withdrawals, status, startDate, endDate, selectedAssets, vaultAssetMap])

  // Clear row selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [status, startDate, endDate, selectedAssets])

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

  const pendingCount = withdrawals.filter((w) => !w.isFulfilled).length
  const fulfilledCount = withdrawals.length - pendingCount

  return (
    // pb-20 leaves room for the sticky FulfillPanel when rows are selected
    <div className={`space-y-4 ${selectedIds.size > 0 ? 'pb-20' : ''}`}>
      <FilterBar
        status={status}
        onStatusChange={setStatus}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        assetOptions={assetOptions}
        selectedAssets={selectedAssets}
        onAssetToggle={handleAssetToggle}
        onClear={() => { setStatus('all'); setStartDate(''); setEndDate(''); setSelectedAssets(new Set()) }}
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
                {['ID', 'Asset', 'Controller', 'Shares', 'Assets', 'Requested At', 'Status'].map(
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
                const meta = assetAddr ? ASSET_METADATA[assetAddr] : undefined
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
                      {meta?.symbol ?? truncateAddress(assetAddr ?? w.vault)}
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-500 dark:text-neutral-400">
                      <span title={w.controller}>{truncateAddress(w.controller)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-white">
                      {formatUnits(w.shares, 18)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-white">
                      {meta ? formatUnits(w.assets, meta.decimals) : w.assets}
                      {meta && (
                        <span className="ml-1 text-neutral-400 dark:text-neutral-500">
                          {meta.symbol}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                      {formatTimestamp(w.requestedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {w.isFulfilled ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Fulfilled
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {mode === 'fulfill' && (
        <FulfillPanel
          selected={selectedRows}
          vaultAssetMap={vaultAssetMap}
          safeInfo={safeInfo}
          onSuccess={handleFulfillSuccess}
        />
      )}
      {mode === 'cancel' && (
        <CancelPanel
          selected={selectedRows}
          safeInfo={safeInfo}
          onSuccess={handleFulfillSuccess}
        />
      )}
    </div>
  )
}
