'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { HA_BASE_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useRoleCheck } from '@/lib/safe/hooks'
import {
  MIN_TIMELOCK_DURATION_SECONDS,
  getPendingDurationChanges,
  getSetterDuration,
  type PendingDurationChange,
  type TimelockEntry,
  type TimelockPageData,
} from '@/lib/timelocks-reader'

type Props = {
  data: TimelockPageData
}

function formatDuration(seconds: string): string {
  const s = Number(seconds)
  if (s === 0) return 'Disabled'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

function parseDurationInput(raw: string): bigint | null {
  const n = Number(raw.trim())
  if (!Number.isFinite(n) || n < 0) return null
  return BigInt(Math.floor(n))
}

function formatCountdown(executableAt: string, now: number): string {
  const eta = Number(executableAt) * 1000
  if (eta <= now) return 'Ready'
  const diff = Math.floor((eta - now) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}m`
}

export default function DurationsTab({ data }: Props) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const { timelocks, pendingOps, fetchedAt } = data

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-700">
            <th className="pb-2 pr-4 font-medium text-neutral-500 dark:text-neutral-400">Function</th>
            <th className="pb-2 pr-4 font-medium text-neutral-500 dark:text-neutral-400">Contract</th>
            <th className="pb-2 pr-4 font-mono text-xs font-medium text-neutral-500 dark:text-neutral-400">Selector</th>
            <th className="pb-2 pr-4 font-medium text-neutral-500 dark:text-neutral-400">Duration</th>
            <th className="pb-2 font-medium text-neutral-500 dark:text-neutral-400" />
          </tr>
        </thead>
        <tbody>
          {timelocks.map((entry) => {
            const rowKey = `${entry.contractAddress}-${entry.selector}`
            const pendingChanges = getPendingDurationChanges(
              pendingOps,
              entry.contractAddress,
              entry.selector,
            )
            return (
              <DurationRow
                key={rowKey}
                entry={entry}
                timelocks={timelocks}
                pendingChanges={pendingChanges}
                nowMs={fetchedAt}
                expanded={expandedRow === rowKey}
                onToggle={() => setExpandedRow(expandedRow === rowKey ? null : rowKey)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DurationRow({
  entry,
  timelocks,
  pendingChanges,
  nowMs,
  expanded,
  onToggle,
}: {
  entry: TimelockEntry
  timelocks: TimelockEntry[]
  pendingChanges: PendingDurationChange[]
  nowMs: number
  expanded: boolean
  onToggle: () => void
}) {
  const { isConnected, chainId } = useAccount()
  const adminCheck = useRoleCheck('admin')
  const proposerCheck = useRoleCheck('timelock_proposer')

  const [durationInput, setDurationInput] = useState('')
  const isWrongChain = isConnected && chainId !== 999

  // Setter delay on this row's contract. If 0, setTimelockDuration is still in
  // its bootstrap window and can be called directly; otherwise the change must
  // be wrapped in submit() and executed later once the delay elapses.
  const setterDuration = getSetterDuration(timelocks, entry.contractAddress)
  const isSetterArmed = setterDuration > 0n

  // Armed path goes through submit() which requires TIMELOCK_PROPOSER_ROLE;
  // bootstrap path calls setTimelockDuration directly which requires
  // DEFAULT_ADMIN_ROLE. Route through the matching Safe.
  const { safeAddress, isSafeOwner, hasRole } = isSetterArmed ? proposerCheck : adminCheck
  const proposeTx = useProposeSafeTransaction(safeAddress)

  function handlePropose() {
    const duration = parseDurationInput(durationInput)
    if (duration === null || duration < MIN_TIMELOCK_DURATION_SECONDS) return
    proposeTx.reset()
    const inner = encodeFunctionData({
      abi: HA_BASE_ABI,
      functionName: 'setTimelockDuration',
      args: [entry.selector as `0x${string}`, duration],
    })
    const calldata = isSetterArmed
      ? encodeFunctionData({ abi: HA_BASE_ABI, functionName: 'submit', args: [inner] })
      : inner
    proposeTx.mutate({ to: getAddress(entry.contractAddress) as `0x${string}`, data: calldata })
  }

  // button state
  let btnLabel: string
  let btnDisabled = false
  let btnClass = 'bg-blue-600 text-white hover:bg-blue-700'
  const parsedDuration = parseDurationInput(durationInput)
  const isBelowFloor = parsedDuration !== null && parsedDuration < MIN_TIMELOCK_DURATION_SECONDS
  const idleLabel = isSetterArmed ? 'Propose via Safe (queue)' : 'Propose via Safe (immediate)'

  if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true
    btnClass = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!isSafeOwner) {
    btnLabel = 'Not a Safe owner'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!hasRole) {
    btnLabel = isSetterArmed ? 'Safe lacks TIMELOCK_PROPOSER_ROLE' : 'Safe lacks DEFAULT_ADMIN_ROLE'
    btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm in wallet...'; btnDisabled = true
  } else if (proposeTx.isSuccess) {
    btnLabel = 'Proposed'; btnDisabled = true
    btnClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    btnLabel = 'Failed — Retry'
    btnClass = 'bg-red-600 text-white hover:bg-red-700'
  } else {
    btnLabel = idleLabel
  }

  return (
    <>
      <tr className="border-b border-neutral-100 dark:border-neutral-800">
        <td className="py-3 pr-4 font-mono text-xs text-neutral-900 dark:text-white">{entry.fnName}</td>
        <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-400 capitalize">
          {entry.contract === 'fundVault' ? 'FundVault' : 'VaultManagerAdmin'}
        </td>
        <td className="py-3 pr-4 font-mono text-xs text-neutral-400">{entry.selector}</td>
        <td className="py-3 pr-4">
          <span
            className={
              entry.duration === '0'
                ? 'text-neutral-400 dark:text-neutral-500'
                : 'font-medium text-neutral-900 dark:text-white'
            }
          >
            {formatDuration(entry.duration)}
          </span>
          {pendingChanges.map((change) => (
            <div key={change.opId} className="mt-1 flex items-center gap-1.5 text-xs">
              <span className="text-neutral-400 dark:text-neutral-500">pending →</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {formatDuration(change.newDuration)}
              </span>
              <span className="text-neutral-400 dark:text-neutral-500">·</span>
              {change.isReady ? (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Ready to execute
                </span>
              ) : (
                <span className="text-neutral-500 dark:text-neutral-400">
                  in {formatCountdown(change.executableAt, nowMs)}
                </span>
              )}
            </div>
          ))}
        </td>
        <td className="py-3 text-right">
          <button
            onClick={onToggle}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {expanded ? 'Cancel' : 'Set Duration'}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-neutral-100 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50">
          <td colSpan={5} className="px-4 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  New duration (seconds) — min 3600 (1 hour)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 86400 = 1 day (min 3600)"
                  value={durationInput}
                  onChange={(e) => { setDurationInput(e.target.value); proposeTx.reset() }}
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                />
                {durationInput && parsedDuration !== null && !isBelowFloor && (
                  <p className="mt-1 text-xs text-neutral-400">{formatDuration(parsedDuration.toString())}</p>
                )}
                {isBelowFloor && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Min 1 hour (3600s) — floor enforced on-chain
                  </p>
                )}
                {durationInput && parsedDuration !== null && !isBelowFloor && (
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {isSetterArmed
                      ? `Queued — executable after ${formatDuration(setterDuration.toString())} on this contract's setter`
                      : 'Immediate — setter is unarmed on this contract'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePropose}
                  disabled={btnDisabled || parsedDuration === null || isBelowFloor}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    parsedDuration === null || isBelowFloor
                      ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
                      : btnClass
                  }`}
                >
                  {btnLabel}
                </button>

                {proposeTx.isSuccess && (
                  <Link href="/safe-transactions" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                    View pending
                  </Link>
                )}

                {proposeTx.error && (
                  <span className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help" title={proposeTx.error.message}>
                    {proposeTx.error.message}
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
