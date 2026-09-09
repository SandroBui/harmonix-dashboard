import type { SafeMultisigConfirmationResponse } from '@safe-global/types-kit'
import type { RoleType } from './roles'

/** Lifecycle status bucket for Safe multisig txs (UI tabs). */
export type SafeTxBucket = 'pending' | 'executed' | 'failed' | 'cancelled'

/**
 * A Safe multisig transaction enriched with decoded data and execution fields.
 * Covers pending, executed, and failed rows from the Safe Transaction Service.
 */
export type SafeMultisigTx = {
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
  /** Decoded calldata from Harmonix decode API, Safe Transaction Service, or local ABI fallback */
  dataDecoded: DataDecoded | null
  /** Human-readable one-line summary, e.g. "HyperSwap - Router - Set Cap Vault to 0xABC…" */
  summary: string
  /** Optional pre-check metadata for fulfillRedeem transactions */
  fulfillPrecheck?: FulfillPrecheck
  /** Whether the Safe has executed this tx on-chain */
  isExecuted: boolean
  /** On-chain success flag; null when not yet executed */
  isSuccessful: boolean | null
  /** ISO timestamp when executed, if any */
  executionDate: string | null
  /** On-chain transaction hash after execution */
  transactionHash: string | null
}

/** @deprecated Prefer SafeMultisigTx — alias kept for existing call sites */
export type PendingSafeTx = SafeMultisigTx

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
  /** JSON ABI fragment used to decode this call, when available. */
  abi?: string
  /** Harmonix decode envelope extras — render API fields instead of local ABI guesswork. */
  protocolName?: string
  contractName?: string
  actionLabel?: string
  /** Harmonix `tokens[]` — used to scale amount params in the detail view. */
  tokens?: DecodedToken[]
}

export type DecodedToken = {
  address: string
  symbol?: string
  decimals?: number
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

export type RoleTaggedTx = SafeMultisigTx & {
  roles: RoleType[]
  safeAddress: `0x${string}`
  safeInfo: SafeInfo | undefined
  /** True when a same-nonce rejection was executed, cancelling this proposal. */
  isCancelled?: boolean
}
