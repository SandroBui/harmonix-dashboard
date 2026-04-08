'use client'

import { useAccount } from 'wagmi'
import { useConfirmSafeTransaction, useExecuteSafeTransaction, useCancelSafeTransaction } from '@/lib/safe/hooks'
import type { PendingSafeTx, SafeInfo } from '@/lib/safe/types'

type Props = {
  tx: PendingSafeTx
  safeInfo: SafeInfo | undefined
  safeAddress: `0x${string}`
}

function isRejectionTx(tx: PendingSafeTx, safeAddress: string): boolean {
  const hasEmptyData = !tx.data || tx.data === '0x'
  const toSelf = tx.to.toLowerCase() === safeAddress.toLowerCase()
  return hasEmptyData && toSelf
}

export default function SafeTxActions({ tx, safeInfo, safeAddress }: Props) {
  const { address, isConnected } = useAccount()
  const confirmTx = useConfirmSafeTransaction(safeAddress)
  const executeTx = useExecuteSafeTransaction(safeAddress)
  const cancelTx = useCancelSafeTransaction(safeAddress)

  if (!isConnected || !address) {
    return (
      <p className="text-sm text-neutral-400">Connect your wallet to sign or execute.</p>
    )
  }

  const isOwner = safeInfo?.owners.some(
    (o) => o.toLowerCase() === address.toLowerCase(),
  ) ?? false

  if (!isOwner) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        Your connected wallet is not a Safe owner.
      </p>
    )
  }

  const hasSigned = tx.confirmations.some(
    (c) => c.owner.toLowerCase() === address.toLowerCase(),
  )

  const isThisARejection = isRejectionTx(tx, safeAddress)

  const isConfirmBusy = confirmTx.isPending && confirmTx.variables?.safeTxHash === tx.safeTxHash
  const isExecuteBusy = executeTx.isPending && executeTx.variables?.safeTxHash === tx.safeTxHash
  const isCancelBusy = cancelTx.isPending && cancelTx.variables?.nonce === Number(tx.nonce)

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* ── Sign ────────────────────────────────────────────────────── */}
      {!hasSigned && !tx.isExecutable && (
        <button
          onClick={() => confirmTx.mutate({ safeTxHash: tx.safeTxHash })}
          disabled={isConfirmBusy}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConfirmBusy ? 'Signing…' : 'Sign'}
        </button>
      )}

      {/* ── Already signed + waiting ─────────────────────────────────── */}
      {hasSigned && !tx.isExecutable && (
        <span className="text-sm font-medium text-green-600 dark:text-green-400">
          ✓ Signed — waiting for {tx.confirmationsRequired - tx.confirmationsCount} more
        </span>
      )}

      {/* ── Execute (threshold met) ──────────────────────────────────── */}
      {tx.isExecutable && (
        <button
          onClick={() => executeTx.mutate({ safeTxHash: tx.safeTxHash })}
          disabled={isExecuteBusy}
          className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExecuteBusy ? 'Executing…' : 'Execute'}
        </button>
      )}

      {/* ── Cancel (only on non-rejection txs, regardless of threshold) ─── */}
      {!isThisARejection && (
        <>
          <span className="text-neutral-200 dark:text-neutral-700 select-none">|</span>
          <button
            onClick={() => cancelTx.mutate({ nonce: Number(tx.nonce) })}
            disabled={isCancelBusy || cancelTx.isSuccess}
            className="rounded-md border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCancelBusy ? 'Proposing rejection…' : 'Cancel Transaction'}
          </button>
        </>
      )}

      {/* ── Errors ──────────────────────────────────────────────────── */}
      {confirmTx.isError && confirmTx.variables?.safeTxHash === tx.safeTxHash && (
        <span className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help" title={confirmTx.error?.message}>
          {confirmTx.error?.message}
        </span>
      )}
      {executeTx.isError && executeTx.variables?.safeTxHash === tx.safeTxHash && (
        <span className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help" title={executeTx.error?.message}>
          {executeTx.error?.message}
        </span>
      )}
      {cancelTx.isError && cancelTx.variables?.nonce === Number(tx.nonce) && (
        <span className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help" title={cancelTx.error?.message}>
          {cancelTx.error?.message}
        </span>
      )}

      {/* ── Success feedback ────────────────────────────────────────── */}
      {confirmTx.isSuccess && confirmTx.data?.safeTxHash === tx.safeTxHash && (
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Signature submitted</span>
      )}
      {executeTx.isSuccess && executeTx.data?.safeTxHash === tx.safeTxHash && (
        <span className="text-sm font-medium text-green-600 dark:text-green-400">✓ Transaction executed</span>
      )}
      {cancelTx.isSuccess && (
        <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
          ✓ Rejection proposed — sign &amp; execute it to finalize cancellation
        </span>
      )}
    </div>
  )
}
