import type { RoleTaggedTx, SafeMultisigTx, SafeTxBucket } from './types'

/** True when the tx is a Safe rejection/cancel (zero-value self-call with empty data). */
export function isRejectionTx(
  tx: Pick<SafeMultisigTx, 'data' | 'to'>,
  safeAddress: string,
): boolean {
  const hasEmptyData = !tx.data || tx.data === '0x'
  const toSelf = tx.to.toLowerCase() === safeAddress.toLowerCase()
  return hasEmptyData && toSelf
}

function isExecutedRejection(
  tx: Pick<SafeMultisigTx, 'data' | 'to' | 'isExecuted' | 'isSuccessful'>,
  safeAddress: string,
): boolean {
  return isRejectionTx(tx, safeAddress) && tx.isExecuted && tx.isSuccessful !== false
}

function nonceKey(tx: Pick<RoleTaggedTx, 'safeAddress' | 'nonce'>): string {
  return `${tx.safeAddress.toLowerCase()}:${tx.nonce}`
}

/**
 * History view: merge an executed rejection with the original proposal(s) at
 * the same nonce. Keeps the original summary and marks the row cancelled.
 * Orphan rejections (original not in this page) stay as a single cancelled row.
 */
export function collapseRejectedSafeTxs(txs: RoleTaggedTx[]): RoleTaggedTx[] {
  const executedRejectionByNonce = new Map<string, RoleTaggedTx>()
  const cancelledNonceHasOriginal = new Set<string>()

  for (const tx of txs) {
    if (!isExecutedRejection(tx, tx.safeAddress)) continue
    executedRejectionByNonce.set(nonceKey(tx), tx)
  }

  for (const tx of txs) {
    if (isRejectionTx(tx, tx.safeAddress)) continue
    if (executedRejectionByNonce.has(nonceKey(tx))) {
      cancelledNonceHasOriginal.add(nonceKey(tx))
    }
  }

  return txs.flatMap((tx) => {
    const key = nonceKey(tx)
    const rejection = executedRejectionByNonce.get(key)
    if (!rejection) return [tx]

    if (isRejectionTx(tx, tx.safeAddress)) {
      if (cancelledNonceHasOriginal.has(key)) return []
      return [{ ...tx, isCancelled: true }]
    }

    return [{
      ...tx,
      isCancelled: true,
      executionDate: rejection.executionDate ?? tx.executionDate,
    }]
  })
}

/**
 * Status badge for a multisig tx (Pending / Executed / Failed / Cancelled).
 *
 * - Cancelled: same-nonce rejection was executed (history collapse)
 * - Pending: not executed
 * - Failed: executed with isSuccessful === false
 * - Executed: executed and successful (isSuccessful !== false)
 */
export function getSafeTxBucket(
  tx: Pick<SafeMultisigTx, 'data' | 'to' | 'isExecuted' | 'isSuccessful'> & {
    isCancelled?: boolean
  },
  safeAddress: string,
): SafeTxBucket {
  if (tx.isCancelled) return 'cancelled'
  if (!tx.isExecuted) return 'pending'
  if (tx.isSuccessful === false) return 'failed'
  if (isRejectionTx(tx, safeAddress)) return 'cancelled'
  return 'executed'
}
