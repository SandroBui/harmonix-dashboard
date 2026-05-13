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
  /** Optional pre-check metadata for fulfillRedeem transactions */
  fulfillPrecheck?: FulfillPrecheck
}

export type FulfillPrecheck = {
  fundVaultAddress: string
  assetAddress: string
  symbol: string
  decimals: number
  requiredAmount: string
  fundVaultBalance: string
  shortfall: string
  isInsufficient: boolean
}

/** Subset of the Safe Transaction Service decoded data shape */
export type DataDecoded = {
  method: string
  parameters: DecodedParam[]
  /**
   * Populated only for Safe `multiSend(bytes)` calls — one entry per inner
   * call packed in the `transactions` blob. Each entry carries the raw target
   * plus a best-effort decoded form using known ABIs.
   */
  multiSendInner?: MultiSendInnerCall[]
}

export type MultiSendInnerCall = {
  /** 0 = CALL, 1 = DELEGATECALL */
  operation: number
  to: string
  value: string
  data: string
  decoded: DataDecoded | null
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
