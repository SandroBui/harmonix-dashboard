'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { HA_BASE_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useRoleCheck } from '@/lib/safe/hooks'
import type { PendingOperation, TimelockPageData } from '@/lib/timelocks-reader'

type Props = {
  data: TimelockPageData
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

export default function RevokeTab({ data }: Props) {
  const [manualData, setManualData] = useState('')
  const [manualTarget, setManualTarget] = useState('')

  return (
    <div className="space-y-6">
      {/* Pending operations from event logs */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Pending Operations
        </h3>

        {data.pendingOps.length === 0 ? (
          <p className="text-sm text-neutral-400">No pending timelocked operations found.</p>
        ) : (
          <div className="space-y-2">
            {data.pendingOps.map((op) => (
              <PendingOpRow key={op.id} op={op} nowMs={data.fetchedAt} />
            ))}
          </div>
        )}
      </section>

      {/* Manual revoke fallback */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="mb-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">Manual Revoke</h3>
        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          For operations older than the lookback window, paste the original calldata and target contract address.
        </p>

        <ManualRevokeForm
          data={manualData}
          target={manualTarget}
          onDataChange={setManualData}
          onTargetChange={setManualTarget}
        />
      </section>
    </div>
  )
}

function PendingOpRow({ op, nowMs }: { op: PendingOperation; nowMs: number }) {
  const { isConnected, chainId } = useAccount()
  const { safeAddress, isSafeOwner, hasRole } = useRoleCheck('admin')
  const proposeTx = useProposeSafeTransaction(safeAddress)

  const isWrongChain = isConnected && chainId !== 999
  const contractAddress = getAddress(op.contractAddress)

  function handleRevoke() {
    proposeTx.reset()
    const calldata = encodeFunctionData({
      abi: HA_BASE_ABI,
      functionName: 'revoke',
      args: [op.data as `0x${string}`],
    })
    proposeTx.mutate({ to: contractAddress as `0x${string}`, data: calldata })
  }

  let btnLabel: string
  let btnDisabled = false
  let btnClass = 'bg-red-600 text-white hover:bg-red-700'

  if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true
    btnClass = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!isSafeOwner) {
    btnLabel = 'Not owner'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!hasRole) {
    btnLabel = 'No role'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm...'; btnDisabled = true
  } else if (proposeTx.isSuccess) {
    btnLabel = 'Proposed'; btnDisabled = true
    btnClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    btnLabel = 'Retry'
    btnClass = 'bg-red-600 text-white hover:bg-red-700'
  } else {
    btnLabel = 'Revoke'
  }

  const etaLabel = op.isReady ? 'Ready' : formatCountdown(op.executableAt, nowMs)

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-neutral-900 dark:text-white">{op.fnName}</span>
            <span className="text-xs text-neutral-400 capitalize">
              {op.contract === 'fundVault' ? 'FundVault' : 'VaultManagerAdmin'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span>
              ETA:{' '}
              {etaLabel === 'Ready' ? (
                <span className="text-green-600 dark:text-green-400">Ready to execute</span>
              ) : (
                etaLabel
              )}
            </span>
            <span className="font-mono">{op.data.slice(0, 18)}...</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {proposeTx.isSuccess && (
            <Link href="/safe-transactions" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              View
            </Link>
          )}
          {proposeTx.error && (
            <span className="max-w-[200px] truncate text-xs text-red-600 cursor-help" title={proposeTx.error.message}>
              {proposeTx.error.message}
            </span>
          )}
          <button
            onClick={handleRevoke}
            disabled={btnDisabled}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${btnClass}`}
          >
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ManualRevokeForm({
  data,
  target,
  onDataChange,
  onTargetChange,
}: {
  data: string
  target: string
  onDataChange: (v: string) => void
  onTargetChange: (v: string) => void
}) {
  const { isConnected, chainId } = useAccount()
  const { safeAddress, isSafeOwner, hasRole } = useRoleCheck('admin')
  const proposeTx = useProposeSafeTransaction(safeAddress)

  const isWrongChain = isConnected && chainId !== 999

  function handlePropose() {
    if (!data.trim() || !target.trim()) return
    try {
      const contractAddress = getAddress(target.trim())
      proposeTx.reset()
      const calldata = encodeFunctionData({
        abi: HA_BASE_ABI,
        functionName: 'revoke',
        args: [data.trim() as `0x${string}`],
      })
      proposeTx.mutate({ to: contractAddress as `0x${string}`, data: calldata })
    } catch {
      // invalid address — let user fix it
    }
  }

  const canPropose = Boolean(data.trim() && target.trim())

  let btnLabel: string
  let btnDisabled = false
  let btnClass = 'bg-red-600 text-white hover:bg-red-700'

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
    btnLabel = 'Propose Revoke via Safe'
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Target contract address
        </label>
        <input
          type="text"
          placeholder="0x..."
          value={target}
          onChange={(e) => { onTargetChange(e.target.value); proposeTx.reset() }}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Original calldata (from the TimelockSubmit event)
        </label>
        <textarea
          placeholder="0x..."
          value={data}
          onChange={(e) => { onDataChange(e.target.value); proposeTx.reset() }}
          rows={3}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePropose}
          disabled={btnDisabled || !canPropose}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            !canPropose
              ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
              : btnClass
          }`}
        >
          {btnLabel}
        </button>

        {proposeTx.isSuccess && (
          <Link href="/safe-transactions" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            View pending transactions
          </Link>
        )}

        {proposeTx.error && (
          <span className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help" title={proposeTx.error.message}>
            {proposeTx.error.message}
          </span>
        )}
      </div>
    </div>
  )
}
