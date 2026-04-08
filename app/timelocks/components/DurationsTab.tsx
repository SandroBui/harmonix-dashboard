'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { HA_BASE_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useRoleCheck } from '@/lib/safe/hooks'
import type { TimelockEntry } from '@/lib/timelocks-reader'

type Props = {
  timelocks: TimelockEntry[]
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

export default function DurationsTab({ timelocks }: Props) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

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
          {timelocks.map((entry) => (
            <DurationRow
              key={entry.selector}
              entry={entry}
              expanded={expandedRow === entry.selector}
              onToggle={() =>
                setExpandedRow(expandedRow === entry.selector ? null : entry.selector)
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DurationRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: TimelockEntry
  expanded: boolean
  onToggle: () => void
}) {
  const { isConnected, chainId } = useAccount()
  const { safeAddress, isSafeOwner, hasRole } = useRoleCheck('admin')
  const proposeTx = useProposeSafeTransaction(safeAddress)

  const [durationInput, setDurationInput] = useState('')
  const isWrongChain = isConnected && chainId !== 999

  function handlePropose() {
    const duration = parseDurationInput(durationInput)
    if (duration === null) return
    proposeTx.reset()
    const calldata = encodeFunctionData({
      abi: HA_BASE_ABI,
      functionName: 'setTimelockDuration',
      args: [entry.selector as `0x${string}`, duration],
    })
    proposeTx.mutate({ to: getAddress(entry.contractAddress) as `0x${string}`, data: calldata })
  }

  // button state
  let btnLabel: string
  let btnDisabled = false
  let btnClass = 'bg-blue-600 text-white hover:bg-blue-700'
  const parsedDuration = parseDurationInput(durationInput)

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
    btnLabel = 'Safe lacks DEFAULT_ADMIN_ROLE'; btnDisabled = true
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
    btnLabel = 'Propose via Safe'
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
                  New duration (seconds) — 0 to disable
                </label>
                <input
                  type="text"
                  placeholder="e.g. 86400 = 1 day"
                  value={durationInput}
                  onChange={(e) => { setDurationInput(e.target.value); proposeTx.reset() }}
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                />
                {durationInput && parsedDuration !== null && (
                  <p className="mt-1 text-xs text-neutral-400">{formatDuration(parsedDuration.toString())}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePropose}
                  disabled={btnDisabled || parsedDuration === null}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    parsedDuration === null
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
