import type { SafeMultisigTx, SafeTxBucket } from './types'

/** True when the tx is a Safe rejection/cancel (zero-value self-call with empty data). */
export function isRejectionTx(
  tx: Pick<SafeMultisigTx, 'data' | 'to'>,
  safeAddress: string,
): boolean {
  const hasEmptyData = !tx.data || tx.data === '0x'
  const toSelf = tx.to.toLowerCase() === safeAddress.toLowerCase()
  return hasEmptyData && toSelf
}

/**
 * Status badge for a multisig tx (Pending / Executed / Failed).
 *
 * - Pending: not executed
 * - Failed: executed with isSuccessful === false, OR executed rejection/cancel
 * - Executed: executed and successful (isSuccessful !== false), and not a rejection
 */
export function getSafeTxBucket(
  tx: Pick<SafeMultisigTx, 'data' | 'to' | 'isExecuted' | 'isSuccessful'>,
  safeAddress: string,
): SafeTxBucket {
  if (!tx.isExecuted) return 'pending'

  if (isRejectionTx(tx, safeAddress)) return 'failed'
  if (tx.isSuccessful === false) return 'failed'
  return 'executed'
}
