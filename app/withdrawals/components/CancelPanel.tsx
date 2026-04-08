'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { VAULT_ASSET_ABI } from '@/lib/abis'
import { useProposeSafeTransaction } from '@/lib/safe/hooks'
import { getSafeAddressForRole } from '@/lib/safe/roles'
import type { SafeInfo } from '@/lib/safe/types'
import type { Withdrawal } from '@/lib/vault-reader'

type Props = {
  selected: Withdrawal[]
  safeInfo: SafeInfo | undefined
  onSuccess: () => void
}

export default function CancelPanel({ selected, safeInfo, onSuccess }: Props) {
  const { address, isConnected, chainId } = useAccount()

  const cancelTx = useProposeSafeTransaction(getSafeAddressForRole('operator'))

  useEffect(() => {
    if (cancelTx.isSuccess) {
      const t = setTimeout(() => { cancelTx.reset(); onSuccess() }, 1000)
      return () => clearTimeout(t)
    }
  }, [cancelTx.isSuccess, onSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (selected.length === 0) return null

  const vaultAddress = getAddress(selected[0].vault) as `0x${string}`
  const controllers = selected.map((w) => getAddress(w.controller) as `0x${string}`)

  const isWrongChain = isConnected && chainId !== 999
  const isOwner = Boolean(address && safeInfo?.owners.some(
    (o) => o.toLowerCase() === address.toLowerCase(),
  ))

  function handleCancelSafe() {
    cancelTx.reset()
    const data = encodeFunctionData({
      abi: VAULT_ASSET_ABI,
      functionName: 'cancelRedeem',
      args: [controllers],
    })
    cancelTx.mutate({ to: vaultAddress, data })
  }

  // ── Cancel button state ──────────────────────────────────────────────────────
  let cancelLabel: string
  let cancelDisabled = false
  let cancelClass = 'bg-rose-600 text-white hover:bg-rose-700'

  if (!isConnected) {
    cancelLabel = 'Connect wallet'
    cancelDisabled = true
    cancelClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    cancelLabel = 'Wrong network'
    cancelDisabled = true
    cancelClass = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!isOwner) {
    cancelLabel = 'Not a Safe owner'
    cancelDisabled = true
    cancelClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (cancelTx.isPending) {
    cancelLabel = 'Confirm in wallet…'
    cancelDisabled = true
  } else if (cancelTx.isSuccess) {
    cancelLabel = '✓ Cancelled'
    cancelDisabled = true
    cancelClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (cancelTx.isError) {
    cancelLabel = 'Failed — Retry'
    cancelClass = 'bg-red-600 text-white hover:bg-red-700'
  } else {
    cancelLabel = 'Cancel Redeem via Safe'
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-rose-200 bg-white px-4 py-3 shadow-lg dark:border-rose-900/40 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-7xl items-center gap-4 flex-wrap">

        {/* Selection summary */}
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
            </svg>
            Cancel mode
          </span>
          <span className="text-neutral-400">·</span>
          <span className="font-medium text-neutral-900 dark:text-white">
            {selected.length} request{selected.length > 1 ? 's' : ''} selected
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {/* Error message */}
          {cancelTx.error && (
            <span
              className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help"
              title={cancelTx.error.message}
            >
              {cancelTx.error.message}
            </span>
          )}

          {/* Spinner */}
          {cancelTx.isPending && (
            <svg className="h-4 w-4 animate-spin text-neutral-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}

          {/* Link to Safe after proposal */}
          {cancelTx.isSuccess && (
            <Link
              href="/safe-transactions"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View pending →
            </Link>
          )}

          {/* Cancel Redeem via Safe */}
          <button
            onClick={handleCancelSafe}
            disabled={cancelDisabled}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${cancelClass}`}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
