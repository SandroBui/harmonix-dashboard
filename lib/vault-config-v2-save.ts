import { encodeFunctionData, getAddress, isAddress, parseUnits } from 'viem'
import { FUND_ADMIN_MANAGER_ABI } from './abis/fund-admin-manager'

export type V2FieldArgType = 'token18' | 'bps_percent' | 'seconds' | 'address' | 'whole_percent'

export type V2FieldValue = bigint | `0x${string}`

export type V2UpdateFnName =
  | 'updateMinimumSupply'
  | 'updateCapacity'
  | 'updatePpsDeviationBps'
  | 'updateMaxNavStaleness'
  | 'updateManagementFeeReceiver'
  | 'updateManagementFeeRate'
  | 'updatePerformanceFeeReceiver'
  | 'updatePerformanceFeeRate'

function parseNonNegativeInt(label: string, raw: string): bigint | string {
  const trimmed = raw.trim()
  if (!trimmed) return `${label} is required`
  if (!/^\d+$/.test(trimmed)) return `${label} must be a whole number`
  return BigInt(trimmed)
}

function parsePercentBps(raw: string): bigint | string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '0') return 0n
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return 'Max PPS Deviation must be a non-negative number'
  return BigInt(Math.round(n * 100))
}

function parseTokenAmount(label: string, raw: string): bigint | string {
  const trimmed = raw.trim()
  if (!trimmed) return `${label} is required`
  try {
    const value = parseUnits(trimmed, 18)
    if (value < 0n) return `${label} must be non-negative`
    return value
  } catch {
    return `${label} is invalid`
  }
}

export function parseFieldInput(
  label: string,
  argType: V2FieldArgType,
  raw: string,
): { value: V2FieldValue } | { error: string } {
  switch (argType) {
    case 'token18': {
      const value = parseTokenAmount(label, raw)
      if (typeof value === 'string') return { error: value }
      return { value }
    }
    case 'bps_percent': {
      const value = parsePercentBps(raw)
      if (typeof value === 'string') return { error: value }
      return { value }
    }
    case 'seconds': {
      const value = parseNonNegativeInt(label, raw)
      if (typeof value === 'string') return { error: value }
      return { value }
    }
    case 'whole_percent': {
      const value = parseNonNegativeInt(label, raw)
      if (typeof value === 'string') return { error: value }
      return { value }
    }
    case 'address': {
      const trimmed = raw.trim()
      if (!isAddress(trimmed)) return { error: `${label} must be a valid address` }
      return { value: getAddress(trimmed) as `0x${string}` }
    }
  }
}

export function encodeFieldCalldata(
  fnName: V2UpdateFnName,
  argType: V2FieldArgType,
  value: V2FieldValue,
): `0x${string}` {
  if (argType === 'address') {
    return encodeFunctionData({
      abi: FUND_ADMIN_MANAGER_ABI,
      functionName: fnName,
      args: [value as `0x${string}`],
    })
  }
  return encodeFunctionData({
    abi: FUND_ADMIN_MANAGER_ABI,
    functionName: fnName,
    args: [value as bigint],
  })
}
