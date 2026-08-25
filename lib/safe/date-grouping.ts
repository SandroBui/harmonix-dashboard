import type { RoleTaggedTx, SafeMultisigTx } from './types'

export type DateGroupedTxs = {
  dateKey: string
  label: string
  txs: RoleTaggedTx[]
}

/** Display date for grouping/sorting — execution time when available, else submission. */
export function getTxDisplayDate(tx: SafeMultisigTx): Date {
  const raw = tx.executionDate ?? tx.submissionDate
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed) : new Date(0)
}

/** Local calendar day key, e.g. `2026-04-20`. */
export function getDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Section header label, e.g. `APR 20, 2026`. */
export function formatDateGroupLabel(date: Date): string {
  return date
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase()
}

/** Time-only label for a row, e.g. `12:20 AM`. */
export function formatTxTime(date: Date): string {
  if (date.getTime() === 0) return '—'
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Group txs by local calendar day; preserves input order within each group. */
export function groupTxsByDate(txs: RoleTaggedTx[]): DateGroupedTxs[] {
  const groups: DateGroupedTxs[] = []
  const indexByKey = new Map<string, number>()

  for (const tx of txs) {
    const displayDate = getTxDisplayDate(tx)
    const dateKey = getDateKey(displayDate)
    const existing = indexByKey.get(dateKey)

    if (existing !== undefined) {
      groups[existing].txs.push(tx)
    } else {
      indexByKey.set(dateKey, groups.length)
      groups.push({
        dateKey,
        label: formatDateGroupLabel(displayDate),
        txs: [tx],
      })
    }
  }

  return groups
}
