import type { SafeMultisigConfirmationResponse } from '@safe-global/types-kit'

/** A pending Safe multisig transaction, enriched with decoded data */
export type PendingSafeTx = {
  safeTxHash: string
  to: string
  value: string
  data: string | null
  operation: number
  nonce: string | number
  submissionDate: string
  confirmationsRequired: number
  confirmations: SafeMultisigConfirmationResponse[]
  confirmationsCount: number
  /** True when enough signatures have been collected to execute */
  isExecutable: boolean
  /** Decoded calldata from Safe Transaction Service or local ABI fallback */
  dataDecoded: DataDecoded | null
  /** Human-readable one-line summary, e.g. "Fulfill 3 withdrawal(s) — 1,000 USDT" */
  summary: string
}

/** Subset of the Safe Transaction Service decoded data shape */
export type DataDecoded = {
  method: string
  parameters: DecodedParam[]
}

export type DecodedParam = {
  name: string
  type: string
  value: string
}

export type SafeInfo = {
  address: string
  owners: string[]
  threshold: number
  nonce: string | number
}
