'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { formatTokenAmount } from '@/lib/format'
import { useConfirmSafeTransaction, useExecuteSafeTransaction, useCancelSafeTransaction } from '@/lib/safe/hooks'
import type { PendingSafeTx, SafeInfo } from '@/lib/safe/types'

type Props = {
  tx: PendingSafeTx
  safeInfo: SafeInfo | undefined
  safeAddress: `0x${string}`
}

const HIGH_VALUE_FULFILL_THRESHOLD = 100_000n

function isRejectionTx(tx: PendingSafeTx, safeAddress: string): boolean {
  const hasEmptyData = !tx.data || tx.data === '0x'
  const toSelf = tx.to.toLowerCase() === safeAddress.toLowerCase()
  return hasEmptyData && toSelf
}

function getFulfillAmount(tx: PendingSafeTx): bigint | null {
  const amount = tx.fulfillPrecheck?.requiredAmount
  if (!amount) return null
  try {
    return BigInt(amount)
  } catch {
    return null
  }
}

export default function SafeTxActions({ tx, safeInfo, safeAddress }: Props) {
  const { address, isConnected, chainId } = useAccount()
  const [showExecuteConfirm, setShowExecuteConfirm] = useState(false)
  const confirmTx = useConfirmSafeTransaction(safeAddress)
  const executeTx = useExecuteSafeTransaction(safeAddress)
  const cancelTx = useCancelSafeTransaction(safeAddress)

  if (!isConnected || !address) {
    return (
      <p className="text-sm text-neutral-400">Connect your wallet to sign or execute.</p>
    )
  }

  const isWrongChain = chainId !== 999

  if (isWrongChain) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        Wrong network. Switch to HyperEVM to sign, execute, or cancel.
      </p>
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

  const isFulfillRedeem = tx.dataDecoded?.method === 'fulfillRedeem'
  const fulfillAmount = getFulfillAmount(tx)
  const fulfillDecimals = tx.fulfillPrecheck?.decimals
  const isInsufficientFulfill = isFulfillRedeem && tx.fulfillPrecheck?.isInsufficient === true
  const isHighValueFulfill = Boolean(
    isFulfillRedeem
      && fulfillAmount !== null
      && fulfillDecimals !== undefined
      && fulfillAmount >= HIGH_VALUE_FULFILL_THRESHOLD * (10n ** BigInt(fulfillDecimals)),
  )
  const needsExecuteConfirm = isFulfillRedeem && (isInsufficientFulfill || isHighValueFulfill)

  function handleExecuteClick() {
    if (isInsufficientFulfill) return
    if (needsExecuteConfirm) {
      setShowExecuteConfirm(true)
      return
    }
    executeTx.mutate({ safeTxHash: tx.safeTxHash })
  }

  function handleConfirmExecute() {
    setShowExecuteConfirm(false)
    executeTx.mutate({ safeTxHash: tx.safeTxHash })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {!hasSigned && !tx.isExecutable && (
          <button
            onClick={() => confirmTx.mutate({ safeTxHash: tx.safeTxHash })}
            disabled={isConfirmBusy}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConfirmBusy ? 'Signing…' : 'Sign'}
          </button>
        )}

        {hasSigned && !tx.isExecutable && (
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            ✓ Signed — waiting for {tx.confirmationsRequired - tx.confirmationsCount} more
          </span>
        )}

        {tx.isExecutable && (
          <button
            onClick={handleExecuteClick}
            disabled={isExecuteBusy || isInsufficientFulfill}
            className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInsufficientFulfill ? 'Blocked: FundVault insufficient' : isExecuteBusy ? 'Executing…' : 'Execute'}
          </button>
        )}

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

        {isInsufficientFulfill && (
          <span className="text-xs text-red-600 dark:text-red-400">
            Execution blocked: FundVault balance is below required fulfill amount.
          </span>
        )}

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

      {showExecuteConfirm && needsExecuteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Confirm execution</h3>
            <div className="mt-2 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
              {isHighValueFulfill && tx.fulfillPrecheck && fulfillAmount !== null && (
                <p>
                  High-value fulfill: {formatTokenAmount(fulfillAmount.toString(), tx.fulfillPrecheck.decimals, 4)} {tx.fulfillPrecheck.symbol}.
                </p>
              )}
              {isInsufficientFulfill && tx.fulfillPrecheck && (
                <p className="text-red-600 dark:text-red-400">
                  FundVault appears short by {formatTokenAmount(tx.fulfillPrecheck.shortfall, tx.fulfillPrecheck.decimals, 4)} {tx.fulfillPrecheck.symbol}.
                </p>
              )}
              <p>Are you sure you want to execute this transaction?</p>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowExecuteConfirm(false)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExecute}
                disabled={isExecuteBusy || isInsufficientFulfill}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExecuteBusy ? 'Executing…' : 'Confirm Execute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
