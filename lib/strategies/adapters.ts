import type { Abi } from 'viem'
import { haPortfolioMarginAdapter } from './ha-portfolio-margin'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * How a form input's string value should be converted to a contract argument.
 *   evm-decimals        → parseUnits(value, asset.decimals)       [uint256]
 *   core-wei-from-evm   → parseUnits(value, asset.decimals) then evmToWei
 *                          The UI also shows the computed wei value.    [uint64]
 *   raw-uint            → BigInt(value)                           [uintN]
 *   string              → value as-is                             [string]
 *   address             → getAddress(value)                       [address]
 *   bool                → value === 'true'                        [bool]
 */
export type AmountKind =
  | 'evm-decimals'
  | 'core-wei-from-evm'
  | 'raw-uint'
  | 'string'
  | 'address'
  | 'bool'

export type StrategyOperationInput = {
  name: string          // must match the ABI param name
  solidityType: string  // e.g. 'uint256', 'uint64', 'string'
  label: string
  kind: AmountKind
  placeholder?: string
  helperText?: string
  /** Shown as a special note when the user enters 0 */
  zeroMeaning?: string
}

export type StrategyOperation = {
  functionName: string
  label: string
  blurb: string
  /** Which Safe role is required to execute this operation */
  role: 'curator' | 'sentinel' | 'admin' | 'timelock_proposer'
  inputs: StrategyOperationInput[]
  /** Prominent warning displayed alongside the form */
  warning?: string
}

export type StrategyAdapter = {
  /** Short type name, e.g. 'HaPortfolioMargin' */
  type: string
  /** Returns true if this adapter handles a strategy with the given description */
  matches: (description: string) => boolean
  /** Minimal ABI needed to encode the operation calldatas */
  abi: Abi
  operations: StrategyOperation[]
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const ADAPTERS: StrategyAdapter[] = [haPortfolioMarginAdapter]

/**
 * Returns the first adapter whose matches() returns true for the given
 * strategy description, or undefined if none is registered.
 */
export function findAdapter(description: string): StrategyAdapter | undefined {
  return ADAPTERS.find((a) => a.matches(description))
}
