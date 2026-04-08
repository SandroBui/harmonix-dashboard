import { decodeFunctionData } from 'viem'
import { VAULT_ASSET_ABI, FUND_NAV_FEED_ABI, VAULT_MANAGER_ABI, FUND_VAULT_ABI, HA_BASE_ABI, VAULT_MANAGER_ADMIN_ABI } from '@/lib/abis'
import { ASSET_METADATA } from '@/lib/contracts'
import { TIMELOCKED_FUNCTIONS } from '@/lib/timelocks-reader'
import { getApiKit } from './api-kit'
import type { DataDecoded, DecodedParam } from './types'

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

/**
 * Attempts to decode transaction calldata, trying:
 *  1. Safe Transaction Service data-decoder endpoint (has broad ABI coverage)
 *  2. Local known ABIs as fallback (vault + ERC-20)
 *
 * Returns null when decoding is not possible (e.g. raw ETH transfer).
 */
export async function decodeTransactionData(
  data: string,
  to: string,
): Promise<DataDecoded | null> {
  if (!data || data === '0x') return null

  // ── 1. Safe Transaction Service decoder ────────────────────────────────
  try {
    const apiKit = getApiKit()
    // The SDK returns the same shape we need
    const decoded = await apiKit.decodeData(data, to) as DataDecoded
    return decoded
  } catch {
    // Service may not recognise the ABI — fall through to local decoding
  }

  // ── 2. Local ABI decoding ───────────────────────────────────────────────
  const knownAbis = [
    VAULT_ASSET_ABI,
    FUND_NAV_FEED_ABI,
    VAULT_MANAGER_ABI,
    FUND_VAULT_ABI,
    HA_BASE_ABI,
    VAULT_MANAGER_ADMIN_ABI,
    ERC20_ABI,
  ] as const

  for (const abi of knownAbis) {
    try {
      const { functionName, args } = decodeFunctionData({
        abi: abi as never,
        data: data as `0x${string}`,
      })

      // Find the matching function entry to get param names + types
      const funcEntry = (abi as readonly { type: string; name?: string; inputs?: readonly { name: string; type: string }[] }[])
        .find((item) => item.type === 'function' && item.name === functionName)

      const parameters: DecodedParam[] = args
        ? (args as unknown[]).map((value, i) => ({
            name: funcEntry?.inputs?.[i]?.name ?? `param${i}`,
            type: funcEntry?.inputs?.[i]?.type ?? 'unknown',
            value: Array.isArray(value)
              ? JSON.stringify(value.map(String))
              : String(value),
          }))
        : []

      return { method: functionName, parameters }
    } catch {
      continue
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Summariser
// ---------------------------------------------------------------------------

/**
 * Produces a short human-readable description of a Safe transaction.
 * e.g. "Fulfill 3 withdrawal(s) — 1,000 USDT" or "Transfer 500 DAI to 0xABC…"
 */
export function summarizeDecodedData(
  decoded: DataDecoded | null,
  to: string,
  value: string,
  vaultAssetMap?: Record<string, string>,
): string {
  if (!decoded) {
    if (value !== '0' && value !== '') {
      const eth = Number(BigInt(value)) / 1e18
      return `Transfer ${eth} ETH to ${truncate(to)}`
    }
    return `Raw call to ${truncate(to)}`
  }

  const { method, parameters } = decoded

  if (method === 'fulfillRedeem') {
    const totalAmount = parameters.find((p) => p.name === 'totalAmount')
    const controllers = parameters.find((p) => p.name === 'controllers')
    const tokenAddr = vaultAssetMap?.[to.toLowerCase()]
    const assetMeta = tokenAddr ? ASSET_METADATA[tokenAddr] : ASSET_METADATA[to.toLowerCase()]
    const formatted = assetMeta && totalAmount
      ? formatAmount(totalAmount.value, assetMeta.decimals) + ' ' + assetMeta.symbol
      : (totalAmount?.value ?? '?')
    let count: number | string = '?'
    try {
      count = (JSON.parse(controllers?.value ?? '[]') as string[]).length
    } catch { /* not a JSON array */ }
    return `Fulfill ${count} withdrawal(s) — ${formatted}`
  }

  if (method === 'transfer') {
    const recipient = parameters.find((p) => p.name === 'to')
    const amount = parameters.find((p) => p.name === 'amount')
    const assetMeta = ASSET_METADATA[to.toLowerCase()]
    const formatted = assetMeta && amount
      ? formatAmount(amount.value, assetMeta.decimals) + ' ' + assetMeta.symbol
      : (amount?.value ?? '?')
    return `Transfer ${formatted} to ${truncate(recipient?.value ?? '')}`
  }

  if (method === 'approve') {
    const spender = parameters.find((p) => p.name === 'spender')
    const assetMeta = ASSET_METADATA[to.toLowerCase()]
    return `Approve ${assetMeta?.symbol ?? truncate(to)} for ${truncate(spender?.value ?? '')}`
  }

  // ── FundNavFeed methods ─────────────────────────────────────────────────
  if (method === 'syncNavValue') {
    const asset = parameters.find((p) => p.name === 'asset')?.value ?? ''
    const desc = parameters.find((p) => p.name === 'description')?.value ?? '?'
    const nav = parameters.find((p) => p.name === 'nav')?.value ?? '0'
    const meta = ASSET_METADATA[asset.toLowerCase()]
    const amount = meta ? formatAmount(nav, meta.decimals) + ' ' + meta.symbol : nav
    return `Sync NAV — "${desc}" → ${amount}`
  }

  if (method === 'addNavCategory') {
    const asset = parameters.find((p) => p.name === 'asset')?.value ?? ''
    const desc = parameters.find((p) => p.name === 'description')?.value ?? '?'
    const meta = ASSET_METADATA[asset.toLowerCase()]
    const label = meta ? meta.symbol : truncate(asset)
    return `Add NAV category "${desc}" for ${label}`
  }

  if (method === 'removeNavCategory') {
    const asset = parameters.find((p) => p.name === 'asset')?.value ?? ''
    const desc = parameters.find((p) => p.name === 'description')?.value ?? '?'
    const meta = ASSET_METADATA[asset.toLowerCase()]
    const label = meta ? meta.symbol : truncate(asset)
    return `Remove NAV category "${desc}" from ${label}`
  }

  if (method === 'setCategoryStatus') {
    const asset = parameters.find((p) => p.name === 'asset')?.value ?? ''
    const desc = parameters.find((p) => p.name === 'description')?.value ?? '?'
    const isActive = parameters.find((p) => p.name === 'isActive')?.value
    const meta = ASSET_METADATA[asset.toLowerCase()]
    const label = meta ? meta.symbol : truncate(asset)
    const status = isActive === 'true' ? 'Activate' : 'Deactivate'
    return `${status} NAV category "${desc}" for ${label}`
  }

  // ── VaultManager methods ────────────────────────────────────────────────
  if (method === 'updateNav') {
    return 'Update NAV — recompute and persist PPS on-chain'
  }

  // ── FundVault methods ──────────────────────────────────────────────────
  if (method === 'addStrategy') {
    const strategy = parameters.find((p) => p.name === 'strategy')?.value ?? ''
    return `Add strategy ${truncate(strategy)}`
  }

  if (method === 'removeStrategy') {
    const strategy = parameters.find((p) => p.name === 'strategy')?.value ?? ''
    return `Remove strategy ${truncate(strategy)}`
  }

  if (method === 'setStrategyCap') {
    const strategy = parameters.find((p) => p.name === 'strategy')?.value ?? ''
    const cap = parameters.find((p) => p.name === 'cap')?.value ?? '0'
    return `Set cap for ${truncate(strategy)} → ${cap}`
  }

  if (method === 'allocate') {
    const strategy = parameters.find((p) => p.name === 'strategy')?.value ?? ''
    const amount = parameters.find((p) => p.name === 'amount')?.value ?? '0'
    return `Allocate ${amount} to strategy ${truncate(strategy)}`
  }

  if (method === 'deallocate') {
    const strategy = parameters.find((p) => p.name === 'strategy')?.value ?? ''
    const amount = parameters.find((p) => p.name === 'amount')?.value ?? '0'
    return `Deallocate ${amount} from strategy ${truncate(strategy)}`
  }

  // ── Timelock submit / revoke ────────────────────────────────────────────
  if (method === 'submit' || method === 'revoke') {
    const dataParam = parameters.find((p) => p.name === 'data')?.value ?? ''
    const inner = decodeSubmitInnerData(dataParam)
    const label = method === 'submit' ? 'Submit timelock' : 'Revoke timelock'
    if (inner) {
      const argSummary = inner.parameters.map((p) => truncate(p.value)).join(', ')
      return `${label}: ${inner.method}(${argSummary})`
    }
    return `${label}: ${truncate(dataParam)}`
  }

  // ── Timelock admin methods ──────────────────────────────────────────────
  if (method === 'setTimelockDuration') {
    const selector = parameters.find((p) => p.name === 'selector')?.value ?? '0x'
    const duration = parameters.find((p) => p.name === 'duration')?.value ?? '0'
    const fnDef = TIMELOCKED_FUNCTIONS.find(
      (f) => f.selector.toLowerCase() === selector.toLowerCase()
    )
    const fnLabel = fnDef?.name ?? selector
    return `Set timelock for ${fnLabel} → ${formatDuration(Number(duration))}`
  }

  // Generic fallback
  return `${method}(${parameters.map((p) => p.name).join(', ')})`
}

// ---------------------------------------------------------------------------
// Submit inner-data decoder
// ---------------------------------------------------------------------------

/**
 * Decodes the `data` bytes argument passed to `submit(bytes)` or `revoke(bytes)`.
 * These bytes are raw calldata for one of the known timelocked functions.
 */
export function decodeSubmitInnerData(bytesHex: string): DataDecoded | null {
  if (!bytesHex || bytesHex.length < 10) return null

  const selector = bytesHex.slice(0, 10).toLowerCase()
  const fnDef = TIMELOCKED_FUNCTIONS.find(
    (f) => f.selector.toLowerCase() === selector,
  )
  if (!fnDef) return null

  try {
    const { functionName, args } = decodeFunctionData({
      abi: fnDef.abi as never,
      data: bytesHex as `0x${string}`,
    })

    const funcEntry = (
      fnDef.abi as readonly {
        type: string
        name?: string
        inputs?: readonly { name: string; type: string }[]
      }[]
    ).find((item) => item.type === 'function' && item.name === functionName)

    const parameters: DecodedParam[] = args
      ? (args as unknown[]).map((value, i) => ({
          name: funcEntry?.inputs?.[i]?.name ?? `param${i}`,
          type: funcEntry?.inputs?.[i]?.type ?? 'unknown',
          value: Array.isArray(value)
            ? JSON.stringify(value.map(String))
            : String(value),
        }))
      : []

    return { method: functionName, parameters }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '0s'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

function formatAmount(raw: string, decimals: number): string {
  try {
    const bn = BigInt(raw)
    if (bn === 0n) return '0'
    const divisor = 10n ** BigInt(decimals)
    const whole = bn / divisor
    const frac = bn % divisor
    if (frac === 0n) return whole.toLocaleString()
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 4)
    return `${whole.toLocaleString()}.${fracStr}`
  } catch {
    return raw
  }
}

// ---------------------------------------------------------------------------
// Minimal ERC-20 ABI for local fallback decoding
// ---------------------------------------------------------------------------

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const
