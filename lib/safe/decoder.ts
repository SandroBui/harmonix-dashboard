import { decodeFunctionData, toFunctionSelector, getAddress } from 'viem'
import { VAULT_ASSET_ABI, FUND_NAV_FEED_ABI, VAULT_MANAGER_ABI, FUND_VAULT_ABI, HA_BASE_ABI, VAULT_MANAGER_ADMIN_ABI, ACCESS_MANAGER_ABI, HA_TIMELOCK_CONTROLLER_ABI } from '@/lib/abis'
import { BALANCE_CONTRACT_ABI, FUND_CONTRACT_ABI, HA_TIME_LOCK_ABI, PERP_NAV_CONTRACT_ABI } from '@/lib/abis'
import type { AssetMeta } from '@/lib/vault-group-config'
import { TIMELOCKED_FUNCTIONS } from '@/lib/timelocks-reader'
import { ROLE_HASHES, ROLE_LABELS } from './roles'
import { V2_ENCODED_ROLE_HASHES, V2_ENCODED_ROLE_LABELS } from '@/lib/v2-role-hashes'
import { getApiKit } from './api-kit'
import { formatDenomination } from '@/lib/format'
import type { DataDecoded, DecodedParam, MultiSendInnerCall } from './types'

// Reverse map: role hash → label
const ROLE_HASH_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_HASHES).map(([key, hash]) => [hash.toLowerCase(), ROLE_LABELS[key as keyof typeof ROLE_LABELS]]),
)

const V2_ROLE_HASH_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(V2_ENCODED_ROLE_HASHES).map(([key, hash]) => [
    hash.toLowerCase(),
    V2_ENCODED_ROLE_LABELS[key as keyof typeof V2_ENCODED_ROLE_LABELS],
  ]),
)

function roleHashToLabel(roleHash: string): string {
  const lower = roleHash.toLowerCase()
  return ROLE_HASH_TO_LABEL[lower] ?? V2_ROLE_HASH_TO_LABEL[lower] ?? truncate(roleHash)
}

// Map known bytes4 selectors to human-readable function names (VaultAsset)
const KNOWN_SELECTORS: Record<string, string> = {}
for (const entry of VAULT_ASSET_ABI) {
  if (entry.type === 'function' && 'name' in entry && 'inputs' in entry) {
    const sig = `${entry.name}(${(entry.inputs as readonly { type: string }[]).map((i) => i.type).join(',')})`
    KNOWN_SELECTORS[toFunctionSelector(sig)] = entry.name
  }
}

/** Resolve a bytes4 selector to its function name, or return the raw hex if unknown. */
export function resolveSelector(selector: string): string {
  return KNOWN_SELECTORS[selector.toLowerCase()] ?? selector
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

/**
 * Attempts to decode transaction calldata, trying:
 *  1. Safe Transaction Service data-decoder endpoint (has broad ABI coverage)
 *  2. Local known ABIs as fallback (vault + ERC-20)
 *
 * Returns null when decoding is not possible (e.g. raw ETH transfer).
 *
 * When the call is a Safe `multiSend(bytes)`, the returned `DataDecoded` is
 * augmented with `multiSendInner` — one entry per inner call, each decoded
 * via the local ABI fallback (synchronous, no extra service round-trips).
 */
export async function decodeTransactionData(
  data: string,
  to: string,
): Promise<DataDecoded | null> {
  if (!data || data === '0x') return null

  let decoded: DataDecoded | null = null

  // ── 1. Safe Transaction Service decoder ────────────────────────────────
  try {
    const apiKit = getApiKit()
    decoded = await apiKit.decodeData(data, to) as DataDecoded
  } catch {
    // Service may not recognise the ABI — fall through to local decoding
  }

  // ── 2. Local ABI decoding ───────────────────────────────────────────────
  if (!decoded) {
    decoded = decodeLocally(data)
  }

  // ── 3. Expand multiSend(bytes) inner calls ─────────────────────────────
  if (decoded?.method === 'multiSend') {
    const txsParam = decoded.parameters.find((p) => p.name === 'transactions')?.value
    if (txsParam) {
      decoded.multiSendInner = parseMultiSendInner(txsParam)
    }
  }

  return decoded
}

/**
 * Synchronous local-ABI decoder. Iterates the known ABI list and returns the
 * first successful match. Returns null when no ABI accepts the calldata.
 */
function decodeLocally(data: string): DataDecoded | null {
  const knownAbis = [
    VAULT_ASSET_ABI,
    FUND_NAV_FEED_ABI,
    VAULT_MANAGER_ABI,
    FUND_VAULT_ABI,
    HA_BASE_ABI,
    VAULT_MANAGER_ADMIN_ABI,
    ACCESS_MANAGER_ABI,
    HA_TIMELOCK_CONTROLLER_ABI,
    BALANCE_CONTRACT_ABI,
    FUND_CONTRACT_ABI,
    HA_TIME_LOCK_ABI,
    PERP_NAV_CONTRACT_ABI,
    ERC20_ABI,
  ] as const

  for (const abi of knownAbis) {
    try {
      const { functionName, args } = decodeFunctionData({
        abi: abi as never,
        data: data as `0x${string}`,
      })

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

/**
 * Parses the packed `transactions` blob that Safe MultiSend consumes.
 * Each entry is: operation(1) || to(20) || value(32) || dataLength(32) || data(dataLength).
 * Decoding of the inner `data` field uses the local-ABI fallback so this stays
 * synchronous; if no ABI matches, `decoded` is left null and the raw hex is
 * still exposed via `data`.
 */
function parseMultiSendInner(bytesHex: string): MultiSendInnerCall[] {
  const hex = bytesHex.startsWith('0x') ? bytesHex.slice(2) : bytesHex
  const calls: MultiSendInnerCall[] = []
  let i = 0
  while (i < hex.length) {
    // Each unit is 2 hex chars per byte.
    if (i + (1 + 20 + 32 + 32) * 2 > hex.length) break
    const operation = parseInt(hex.slice(i, i + 2), 16)
    i += 2
    const to = `0x${hex.slice(i, i + 40)}`
    i += 40
    const value = BigInt(`0x${hex.slice(i, i + 64)}`).toString()
    i += 64
    const dataLen = parseInt(hex.slice(i, i + 64), 16)
    i += 64
    const dataHex = `0x${hex.slice(i, i + dataLen * 2)}`
    i += dataLen * 2

    let decoded: DataDecoded | null = null
    try {
      decoded = decodeLocally(dataHex)
    } catch {
      decoded = null
    }

    calls.push({
      operation,
      to: getAddress(to),
      value,
      data: dataHex,
      decoded,
    })
  }
  return calls
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
  assetMetadata: Record<string, AssetMeta> = {},
): string {
  if (!decoded) {
    if (value !== '0' && value !== '') {
      const eth = Number(BigInt(value)) / 1e18
      return `Transfer ${eth} ETH to ${truncate(to)}`
    }
    return `Raw call to ${truncate(to)}`
  }

  const { method, parameters } = decoded

  if (method === 'multiSend') {
    const inner = decoded.multiSendInner ?? []
    if (inner.length === 0) return 'MultiSend (empty)'
    const labels = inner.map((c) => c.decoded?.method ?? `raw call to ${truncate(c.to)}`)
    return `MultiSend (${inner.length}): ${labels.join(' → ')}`
  }

  if (method === 'fulfillRedeem') {
    // v0.6.0: signature is fulfillRedeem(address[] controllers) — totalAmount is no longer
    // an input. AsyncRequestManager computes the exact pull from the controllers' requests.
    const controllers = parameters.find((p) => p.name === 'controllers')
    let count: number | string = '?'
    try {
      count = (JSON.parse(controllers?.value ?? '[]') as string[]).length
    } catch { /* not a JSON array */ }
    return `Fulfill ${count} withdrawal(s)`
  }

  if (method === 'cancelRedeem') {
    const controllers = parameters.find((p) => p.name === 'controllers')
    let count: number | string = '?'
    try {
      count = (JSON.parse(controllers?.value ?? '[]') as string[]).length
    } catch { /* not a JSON array */ }
    return `Cancel ${count} redeem request(s)`
  }

  if (method === 'transfer') {
    const recipient = parameters.find((p) => p.name === 'to')
    const amount = parameters.find((p) => p.name === 'amount' || p.name === 'value')
    const assetMeta = assetMetadata[to.toLowerCase()]
    const formatted = assetMeta && amount
      ? formatAmount(amount.value, assetMeta.decimals) + ' ' + assetMeta.symbol
      : (amount?.value ?? '?')
    return `Transfer ${formatted} to ${truncate(recipient?.value ?? '')}`
  }

  if (method === 'approve') {
    const spender = parameters.find((p) => p.name === 'spender')
    const assetMeta = assetMetadata[to.toLowerCase()]
    return `Approve ${assetMeta?.symbol ?? truncate(to)} for ${truncate(spender?.value ?? '')}`
  }

  if (method === 'executeAction') {
    const target =
      parameters.find((p) => p.name === '_target' || p.name === 'target')?.value ?? ''
    const innerBytes =
      parameters.find((p) => p.name === '_data' || p.name === 'data')?.value ?? ''
    const inner = decodeLocally(innerBytes)
    if (inner) {
      const innerSummary = summarizeDecodedData(inner, target, '0', vaultAssetMap, assetMetadata)
      return `executeAction → ${innerSummary}`
    }
    return `executeAction on ${truncate(target)}`
  }

  if (method === 'acquireWithdrawalFunds') {
    const users = parameters.find((p) => p.name === '_users' || p.name === 'users')
    let count: number | string = '?'
    try {
      count = (JSON.parse(users?.value ?? '[]') as string[]).length
    } catch {
      /* not a JSON array */
    }
    return `Acquire withdrawal funds for ${count} user(s)`
  }

  // ── FundNavFeed methods ─────────────────────────────────────────────────
  if (method === 'syncNavValue') {
    const desc = parameters.find((p) => p.name === 'description')?.value ?? '?'
    const nav = parameters.find((p) => p.name === 'nav')?.value ?? '0'
    // `nav` is a USD denomination at 1e18 scale — not a token amount in `asset`.
    return `Sync NAV — "${desc}" → ${formatDenomination(nav, 6)}`
  }

  if (method === 'addNavCategory') {
    const asset = parameters.find((p) => p.name === 'asset')?.value ?? ''
    const desc = parameters.find((p) => p.name === 'description')?.value ?? '?'
    const meta = assetMetadata[asset.toLowerCase()]
    const label = meta ? meta.symbol : truncate(asset)
    return `Add NAV category "${desc}" for ${label}`
  }

  if (method === 'removeNavCategory') {
    const asset = parameters.find((p) => p.name === 'asset')?.value ?? ''
    const desc = parameters.find((p) => p.name === 'description')?.value ?? '?'
    const meta = assetMetadata[asset.toLowerCase()]
    const label = meta ? meta.symbol : truncate(asset)
    return `Remove NAV category "${desc}" from ${label}`
  }

  if (method === 'setCategoryStatus') {
    const asset = parameters.find((p) => p.name === 'asset')?.value ?? ''
    const desc = parameters.find((p) => p.name === 'description')?.value ?? '?'
    const isActive = parameters.find((p) => p.name === 'isActive')?.value
    const meta = assetMetadata[asset.toLowerCase()]
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

  // ── HaTimelockController methods ────────────────────────────────────────
  if (method === 'schedule') {
    const target = parameters.find((p) => p.name === 'target')?.value ?? ''
    const dataBytes = parameters.find((p) => p.name === 'data')?.value ?? ''
    const delaySec = Number(parameters.find((p) => p.name === 'delay')?.value ?? '0')
    const inner = decodeUpgradeInnerData(dataBytes)
    const innerLabel = inner
      ? `${inner.method}(${inner.parameters.map((p) => truncate(p.value)).join(', ')})`
      : truncate(dataBytes)
    return `Schedule timelock — ${innerLabel} on ${truncate(target)} (delay ${formatDuration(delaySec)})`
  }

  if (method === 'execute') {
    const target = parameters.find((p) => p.name === 'target')?.value ?? ''
    const payloadBytes = parameters.find((p) => p.name === 'payload')?.value ?? ''
    const inner = decodeUpgradeInnerData(payloadBytes)
    const innerLabel = inner
      ? `${inner.method}(${inner.parameters.map((p) => truncate(p.value)).join(', ')})`
      : truncate(payloadBytes)
    return `Execute timelock — ${innerLabel} on ${truncate(target)}`
  }

  if (method === 'cancel') {
    const id = parameters.find((p) => p.name === 'id')?.value ?? ''
    return `Cancel timelock op ${truncate(id)}`
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

  // ── Emergency methods ───────────────────────────────────────────────
  if (method === 'pauseContract') {
    const contract = parameters.find((p) => p.name === 'haContract')?.value ?? ''
    return `Pause contract ${truncate(contract)}`
  }

  if (method === 'unpauseContract') {
    const contract = parameters.find((p) => p.name === 'haContract')?.value ?? ''
    return `Unpause contract ${truncate(contract)}`
  }

  if (method === 'setPaused') {
    const paused = parameters.find((p) => p.name === '_paused')?.value
    if (paused === 'true') return 'Pause contract (setPaused true)'
    if (paused === 'false') return 'Unpause contract (setPaused false)'
    return 'Set pause state'
  }

  if (method === 'disableFunction') {
    const contract = parameters.find((p) => p.name === 'haContract')?.value ?? ''
    const selector = parameters.find((p) => p.name === 'selector')?.value ?? ''
    const fnName = KNOWN_SELECTORS[selector.toLowerCase()] ?? selector
    return `Disable ${fnName}() on ${truncate(contract)}`
  }

  if (method === 'enableFunction') {
    const contract = parameters.find((p) => p.name === 'haContract')?.value ?? ''
    const selector = parameters.find((p) => p.name === 'selector')?.value ?? ''
    const fnName = KNOWN_SELECTORS[selector.toLowerCase()] ?? selector
    return `Enable ${fnName}() on ${truncate(contract)}`
  }

  // ── VaultManagerAdmin setters ────────────────────────────────────────
  if (method === 'setNavAggregateModel') {
    const addr = parameters.find((p) => p.name === 'addr')?.value ?? ''
    return `Set NavAggregateModel → ${truncate(addr)}`
  }

  if (method === 'registerVault') {
    const vault = parameters.find((p) => p.name === 'vault')?.value ?? ''
    return `Register vault ${truncate(vault)}`
  }

  if (method === 'removeVault') {
    const vault = parameters.find((p) => p.name === 'vault')?.value ?? ''
    return `Remove vault ${truncate(vault)}`
  }

  // ── AccessManager role management ──────────────────────────────────────
  if (method === 'grantRole') {
    const roleHash = parameters.find((p) => p.name === 'role')?.value ?? ''
    const account = parameters.find((p) => p.name === 'account')?.value ?? ''
    const roleLabel = roleHashToLabel(roleHash)
    return `Grant or execute pending ${roleLabel} for ${truncate(account)}`
  }

  if (method === 'revokeRole') {
    const roleHash = parameters.find((p) => p.name === 'role')?.value ?? ''
    const account = parameters.find((p) => p.name === 'account')?.value ?? ''
    const roleLabel = roleHashToLabel(roleHash)
    return `Revoke ${roleLabel} role from ${truncate(account)}`
  }

  if (method === 'setRoleTimelock') {
    const roleHash = parameters.find((p) => p.name === 'role')?.value ?? ''
    const delay = Number(parameters.find((p) => p.name === 'delay')?.value ?? '0')
    const roleLabel = roleHashToLabel(roleHash)
    return `Set ${roleLabel} timelock to ${formatDuration(delay)}`
  }

  if (method === 'cancelPendingGrant') {
    const roleHash = parameters.find((p) => p.name === 'role')?.value ?? ''
    const roleLabel = roleHashToLabel(roleHash)
    return `Cancel pending ${roleLabel} grant`
  }

  // Generic fallback
  return `${method}(${parameters.map((p) => p.name).join(', ')})`
}

// ---------------------------------------------------------------------------
// Schedule/execute inner-data decoder (timelocked upgrade payload)
// ---------------------------------------------------------------------------

const UPGRADE_INNER_ABIS = [
  [
    {
      type: 'function',
      name: 'upgradeToAndCall',
      stateMutability: 'payable',
      inputs: [
        { name: 'newImplementation', type: 'address' },
        { name: 'data', type: 'bytes' },
      ],
      outputs: [],
    },
    {
      type: 'function',
      name: 'upgradeTo',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'newImplementation', type: 'address' }],
      outputs: [],
    },
    {
      type: 'function',
      name: 'upgrade',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'proxy', type: 'address' },
        { name: 'implementation', type: 'address' },
      ],
      outputs: [],
    },
    {
      type: 'function',
      name: 'upgradeAndCall',
      stateMutability: 'payable',
      inputs: [
        { name: 'proxy', type: 'address' },
        { name: 'implementation', type: 'address' },
        { name: 'data', type: 'bytes' },
      ],
      outputs: [],
    },
  ],
] as const

/** Best-effort decode of a `data` payload scheduled/executed by the timelock. */
export function decodeUpgradeInnerData(bytesHex: string): DataDecoded | null {
  if (!bytesHex || bytesHex.length < 10) return null

  for (const abi of UPGRADE_INNER_ABIS) {
    try {
      const { functionName, args } = decodeFunctionData({
        abi: abi as never,
        data: bytesHex as `0x${string}`,
      })
      const funcEntry = (
        abi as readonly {
          type: string
          name?: string
          inputs?: readonly { name: string; type: string }[]
        }[]
      ).find((item) => item.type === 'function' && item.name === functionName)

      const parameters: DecodedParam[] = args
        ? (args as unknown[]).map((value, i) => ({
            name: funcEntry?.inputs?.[i]?.name ?? `param${i}`,
            type: funcEntry?.inputs?.[i]?.type ?? 'unknown',
            value: Array.isArray(value) ? JSON.stringify(value.map(String)) : String(value),
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
