import { decodeFunctionData, toFunctionSelector, getAddress } from 'viem'
import { VAULT_ASSET_ABI, FUND_NAV_FEED_ABI, VAULT_MANAGER_ABI, FUND_VAULT_ABI, HA_BASE_ABI, VAULT_MANAGER_ADMIN_ABI, ACCESS_MANAGER_ABI, HA_TIMELOCK_CONTROLLER_ABI } from '@/lib/abis'
import { BALANCE_CONTRACT_ABI, FUND_ADMIN_MANAGER_ABI, FUND_CONTRACT_ABI, HA_TIME_LOCK_ABI, PERP_NAV_CONTRACT_ABI } from '@/lib/abis'
import type { AssetMeta } from '@/lib/vault-group-config'
import { TIMELOCKED_FUNCTIONS } from '@/lib/timelocks-reader'
import { ROLE_HASHES, ROLE_LABELS } from './roles'
import { V2_ENCODED_ROLE_HASHES, V2_ENCODED_ROLE_LABELS } from '@/lib/v2-role-hashes'
import { getApiKit } from './api-kit'
import { formatDenomination, formatTokenAmount } from '@/lib/format'
import { nativeTokenSymbol } from '@/lib/networks'
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
 *  1. Harmonix decode API (`TRANSACTION_DECODE_API_BASE_URL` via `/api/transactions/decode`)
 *  2. Safe Transaction Service data-decoder endpoint (broad ABI coverage)
 *  3. Local known ABIs (vault + ERC-20)
 *
 * Returns null when decoding is not possible (e.g. raw native-token transfer).
 *
 * When the call is a Safe `multiSend(bytes)`, the returned `DataDecoded` is
 * augmented with `multiSendInner` — one entry per inner call. Prefer inner
 * calls from the Harmonix API when present; otherwise parse the packed blob
 * and decode each inner `data` via the local ABI fallback.
 */
export type DecodeTxContext = {
  chainId?: number
  from?: string
  value?: string
  /** When set, reuse a prior decode for this Safe tx (load more), not for matching calldata. */
  safeTxHash?: string
}

const decodeBySafeTxHash = new Map<string, Promise<DataDecoded | null>>()

export async function decodeTransactionData(
  data: string,
  to: string,
  chainIdOrContext?: number | DecodeTxContext,
): Promise<DataDecoded | null> {
  if (!data || data === '0x') return null

  const context: DecodeTxContext =
    typeof chainIdOrContext === 'number' || chainIdOrContext === undefined
      ? { chainId: chainIdOrContext }
      : chainIdOrContext

  const hashKey = context.safeTxHash?.toLowerCase()
  if (hashKey) {
    const cached = decodeBySafeTxHash.get(hashKey)
    if (cached) return cached
  }

  const pending = decodeTransactionDataUncached(data, to, context)
  if (hashKey) decodeBySafeTxHash.set(hashKey, pending)
  try {
    const result = await pending
    // Do not cache a miss — UNKNOWN_ABI today may decode after fallback/ABI updates.
    if (!result && hashKey) decodeBySafeTxHash.delete(hashKey)
    return result
  } catch (error) {
    if (hashKey) decodeBySafeTxHash.delete(hashKey)
    throw error
  }
}

async function decodeTransactionDataUncached(
  data: string,
  to: string,
  context: DecodeTxContext,
): Promise<DataDecoded | null> {
  const chainId = context.chainId

  let decoded: DataDecoded | null = null
  const harmonix = await decodeViaHarmonixApi(data, to, context)
  if (harmonix.ok && harmonix.decoded) {
    // Harmonix SUCCESS (mapped method) is authoritative.
    decoded = harmonix.decoded
  } else {
    // HTTP error, UNKNOWN_ABI, or an unmapped 200 — try Safe then local ABIs.
    try {
      const apiKit = getApiKit(chainId ?? 999)
      decoded = await apiKit.decodeData(data, to) as DataDecoded
    } catch {
      // Service may not recognise the ABI — fall through to local decoding
    }

    if (!decoded) {
      decoded = decodeLocally(data)
    }
  }

  if (decoded?.method === 'multiSend' && !decoded.multiSendInner) {
    const txsParam = decoded.parameters.find((p) => p.name === 'transactions')?.value
    if (txsParam) {
      decoded.multiSendInner = parseMultiSendInner(txsParam)
    }
  }

  return decoded ? withSynthesizedAbi(decoded) : null
}

function withSynthesizedAbi(decoded: DataDecoded): DataDecoded {
  // Harmonix SUCCESS envelopes often omit ABI; do not invent a fragment that
  // disagrees with the API payload. Local / Safe decodes still get a fragment.
  const shouldSynthesize = !decoded.abi && !decoded.actionLabel && !decoded.protocolName
  return {
    ...decoded,
    abi: decoded.abi ?? (shouldSynthesize ? synthesizeFunctionAbi(decoded.method, decoded.parameters) : undefined),
    multiSendInner: decoded.multiSendInner?.map((call) => ({
      ...call,
      decoded: call.decoded ? withSynthesizedAbi(call.decoded) : null,
    })),
  }
}

function getDashboardOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return process.env.SAFE_PROXY_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

async function decodeViaHarmonixApi(
  data: string,
  to: string,
  context: DecodeTxContext,
): Promise<{ ok: boolean; decoded: DataDecoded | null }> {
  try {
    const res = await fetch(`${getDashboardOrigin()}/api/transactions/decode`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chain_id: context.chainId,
        from: context.from,
        to,
        data,
        value: context.value ?? '0',
      }),
    })
    if (!res.ok) return { ok: false, decoded: null }
    const payload: unknown = await res.json()
    return { ok: true, decoded: mapHarmonixDecodeResponse(payload) }
  } catch {
    return { ok: false, decoded: null }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringifyAbiJson(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      return trimmed
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
}

function synthesizeFunctionAbi(method: string, parameters: DecodedParam[]): string {
  return JSON.stringify(
    [
      {
        type: 'function',
        name: method,
        inputs: parameters.map((p) => ({ name: p.name, type: p.type })),
        outputs: [],
        stateMutability: 'nonpayable',
      },
    ],
    null,
    2,
  )
}

function abiFromObject(obj: Record<string, unknown>): string | undefined {
  return (
    stringifyAbiJson(obj.abi) ??
    stringifyAbiJson(obj.abi_json) ??
    stringifyAbiJson(obj.abiJson)
  )
}

function inferSolidityType(value: unknown): string {
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number' || typeof value === 'bigint') return 'uint256'
  if (typeof value === 'string') {
    if (/^0x[0-9a-fA-F]{40}$/.test(value)) return 'address'
    if (/^0x[0-9a-fA-F]{8}$/.test(value)) return 'bytes4'
    if (/^0x[0-9a-fA-F]+$/.test(value) && value.length > 10) return 'bytes'
    if (/^\d+$/.test(value)) return 'uint256'
    return 'string'
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'tuple[]'
    return `${inferSolidityType(value[0])}[]`
  }
  return 'tuple'
}

function paramValueToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => (typeof item === 'string' ? item : String(item))))
  }
  return JSON.stringify(value)
}

function methodFromObject(obj: Record<string, unknown>): string | null {
  const fnObj = isRecord(obj.function) ? obj.function : null
  const direct =
    (typeof obj.method === 'string' && obj.method) ||
    (typeof obj.functionName === 'string' && obj.functionName) ||
    (typeof obj.function_name === 'string' && obj.function_name) ||
    (typeof obj.function === 'string' && obj.function) ||
    (fnObj && typeof fnObj.name === 'string' && fnObj.name) ||
    null
  if (direct) {
    const paren = direct.indexOf('(')
    return paren > 0 ? direct.slice(0, paren) : direct
  }
  if (typeof obj.signature === 'string' && obj.signature.includes('(')) {
    return obj.signature.slice(0, obj.signature.indexOf('('))
  }
  if (fnObj && typeof fnObj.signature === 'string' && fnObj.signature.includes('(')) {
    return fnObj.signature.slice(0, fnObj.signature.indexOf('('))
  }
  if (isRecord(obj.abi) && typeof obj.abi.name === 'string') {
    return obj.abi.name
  }
  // ABI fragment `{ type: "function", name: "transfer", inputs: [...] }`
  if (obj.type === 'function' && typeof obj.name === 'string' && obj.name) {
    const paren = obj.name.indexOf('(')
    return paren > 0 ? obj.name.slice(0, paren) : obj.name
  }
  return null
}

function mapParameters(parameters: unknown): DecodedParam[] {
  if (Array.isArray(parameters)) {
    return parameters.map((param, i) => {
      if (!isRecord(param)) {
        return { name: `param${i}`, type: 'unknown', value: paramValueToString(param) }
      }
      return {
        name: typeof param.name === 'string' ? param.name : `param${i}`,
        type: typeof param.type === 'string' ? param.type : 'unknown',
        value: paramValueToString(param.value ?? param.val ?? param.arg),
      }
    })
  }
  if (isRecord(parameters)) {
    return Object.entries(parameters).map(([name, value]) => ({
      name,
      type: inferSolidityType(value),
      value: paramValueToString(value),
    }))
  }
  return []
}

function mapDecodedObject(obj: Record<string, unknown>): DataDecoded | null {
  const method = methodFromObject(obj)
  if (!method) return null

  const parameters = mapParameters(
    obj.parameters ?? obj.params ?? obj.inputs ?? obj.args ?? obj.arguments,
  )
  const protocol = isRecord(obj.protocol) ? obj.protocol : null
  const contract = isRecord(obj.contract) ? obj.contract : null
  const action = isRecord(obj.action) ? obj.action : null
  const decoded: DataDecoded = {
    method,
    parameters,
    abi: abiFromObject(obj),
    protocolName: typeof protocol?.name === 'string' ? protocol.name : undefined,
    contractName: typeof contract?.name === 'string' ? contract.name : undefined,
    actionLabel:
      (typeof action?.type === 'string' && action.type) ||
      (typeof obj.action === 'string' && obj.action) ||
      undefined,
  }

  const inner = mapMultiSendInner(
    obj.multiSendInner ?? obj.inner_calls ?? obj.innerCalls ?? obj.transactions ?? obj.calls,
  )
  if (inner) decoded.multiSendInner = inner

  if (!decoded.multiSendInner) {
    const rawParams = obj.parameters ?? obj.params ?? obj.inputs ?? obj.args
    if (Array.isArray(rawParams)) {
      const rawTxs = rawParams.find((p) => isRecord(p) && p.name === 'transactions')
      if (isRecord(rawTxs)) {
        const mapped = mapMultiSendInner(rawTxs.valueDecoded ?? rawTxs.value_decoded ?? rawTxs.value)
        if (mapped) decoded.multiSendInner = mapped
      }
    }
  }

  return decoded
}

function mapMultiSendInner(value: unknown): MultiSendInnerCall[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const calls: MultiSendInnerCall[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const to =
      (typeof item.to === 'string' && item.to) ||
      (typeof item.target === 'string' && item.target) ||
      null
    if (!to) continue
    const data = typeof item.data === 'string' ? item.data : '0x'
    const operation = typeof item.operation === 'number' ? item.operation : 0
    const callValue = item.value == null ? '0' : String(item.value)
    const innerDecodedRaw = item.decoded ?? item.dataDecoded ?? item.data_decoded
    calls.push({
      operation,
      to,
      value: callValue,
      data,
      decoded: isRecord(innerDecodedRaw) ? mapDecodedObject(innerDecodedRaw) : null,
    })
  }
  return calls.length > 0 ? calls : undefined
}

function unwrapDecodePayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload
  const nested =
    (isRecord(payload.data) && payload.data) ||
    (isRecord(payload.decoded) && payload.decoded) ||
    (isRecord(payload.decoded_data) && payload.decoded_data) ||
    (isRecord(payload.decoded_tx) && payload.decoded_tx) ||
    (isRecord(payload.decodedTx) && payload.decodedTx) ||
    (isRecord(payload.result) && payload.result) ||
    (isRecord(payload.decode_result) && payload.decode_result) ||
    null
  if (nested && (methodFromObject(nested) || isRecord(nested.function) || nested.parameters || nested.params || nested.args || nested.inputs)) {
    return nested
  }
  return payload
}

function mapHarmonixDecodeResponse(payload: unknown): DataDecoded | null {
  const unwrapped = unwrapDecodePayload(payload)
  if (!isRecord(unwrapped)) return null
  return mapDecodedObject(unwrapped)
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
    FUND_ADMIN_MANAGER_ABI,
    HA_TIME_LOCK_ABI,
    PERP_NAV_CONTRACT_ABI,
    ERC20_ABI,
    SAFE_MANAGEMENT_ABI,
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

      return {
        method: functionName,
        parameters,
        abi:
          stringifyAbiJson(funcEntry ? [funcEntry] : undefined) ??
          synthesizeFunctionAbi(functionName, parameters),
      }
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
 * Fills placeholders in a Harmonix `action.type` template.
 * `{0}` / `{paramName}` — raw value (addresses truncated).
 * `{0/6}` / `{paramName/6}` — numeric value scaled by 6 decimals (e.g. 1000000 → 1).
 */
export function interpolateActionLabel(actionLabel: string, parameters: DecodedParam[]): string {
  const byName = new Map(parameters.map((p) => [p.name.toLowerCase(), p]))
  return actionLabel.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const filled = resolveActionPlaceholder(key.trim(), parameters, byName)
    return filled ?? match
  })
}

function resolveActionPlaceholder(
  key: string,
  parameters: DecodedParam[],
  byName: Map<string, DecodedParam>,
): string | null {
  let ref = key
  let decimals: number | undefined
  const slash = key.lastIndexOf('/')
  if (slash >= 0) {
    const maybeDecimals = key.slice(slash + 1).trim()
    if (/^\d+$/.test(maybeDecimals)) {
      ref = key.slice(0, slash).trim()
      decimals = Number(maybeDecimals)
    }
  }

  const param = /^\d+$/.test(ref)
    ? parameters[Number(ref)]
    : byName.get(ref.toLowerCase())
  if (!param || param.value === '') return null

  if (decimals !== undefined && isNumericParam(param)) {
    try {
      return formatTokenAmount(param.value, decimals, decimals)
    } catch {
      return param.value
    }
  }

  if (param.type === 'address' || /^0x[0-9a-fA-F]{40}$/.test(param.value)) {
    return truncate(param.value)
  }
  return param.value
}

function isNumericParam(param: DecodedParam): boolean {
  if (/^u?int/i.test(param.type)) return true
  if (
    param.type === 'bool' ||
    param.type === 'address' ||
    param.type.startsWith('bytes') ||
    param.type.endsWith('[]')
  ) {
    return false
  }
  return /^-?\d+$/.test(param.value)
}

/**
 * List/detail header: `protocol name - contract name - action` with parameters
 * interpolated into the action template. Returns null when Harmonix extras are absent.
 */
export function formatDecodedTxHeader(decoded: DataDecoded, fallbackAction?: string): string | null {
  const hasExtras = Boolean(decoded.protocolName || decoded.contractName || decoded.actionLabel)
  if (!hasExtras) return null
  const action = decoded.actionLabel
    ? interpolateActionLabel(decoded.actionLabel, decoded.parameters)
    : fallbackAction
  const parts = [decoded.protocolName, decoded.contractName, action].filter(
    (part): part is string => Boolean(part && part.trim()),
  )
  return parts.length > 0 ? parts.join(' - ') : null
}

/**
 * Produces a short human-readable description of a Safe transaction.
 * Harmonix SUCCESS payloads: "HyperSwap - Router - Set Cap Vault to 0xABC…".
 * Local / Safe decoder fallback: "Fulfill 3 withdrawal(s)" / "Transfer 500 DAI to 0xABC…".
 */
export function summarizeDecodedData(
  decoded: DataDecoded | null,
  to: string,
  value: string,
  vaultAssetMap?: Record<string, string>,
  assetMetadata: Record<string, AssetMeta> = {},
  chainId?: number,
): string {
  if (!decoded) {
    if (value !== '0' && value !== '') {
      const amount = formatTokenAmount(value, 18)
      return `Transfer ${amount} ${nativeTokenSymbol(chainId)} to ${truncate(to)}`
    }
    return `Raw call to ${truncate(to)}`
  }

  const methodSummary = summarizeDecodedMethod(decoded, to, vaultAssetMap, assetMetadata, chainId)
  return formatDecodedTxHeader(decoded, methodSummary) ?? methodSummary
}

function summarizeDecodedMethod(
  decoded: DataDecoded,
  to: string,
  vaultAssetMap?: Record<string, string>,
  assetMetadata: Record<string, AssetMeta> = {},
  chainId?: number,
): string {
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

  if (method === 'redeem') {
    const controller = parameters.find((p) => p.name === 'controller')?.value ?? ''
    return `Redeem on behalf for ${truncate(controller)}`
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
      const innerSummary = summarizeDecodedData(inner, target, '0', vaultAssetMap, assetMetadata, chainId)
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

  if (method === 'updateVaultSetting') {
    return 'Update vault settings (supply, capacity, fees, NAV guards)'
  }

  if (method === 'updateMinimumSupply') {
    const value = parameters.find((p) => p.name === '_minimumSupply')?.value ?? '?'
    return `Update minimum supply → ${value}`
  }

  if (method === 'updateCapacity') {
    const value = parameters.find((p) => p.name === '_capacity')?.value ?? '?'
    return `Update capacity → ${value}`
  }

  if (method === 'updatePpsDeviationBps') {
    const value = parameters.find((p) => p.name === '_ppsDeviationBps')?.value ?? '?'
    return `Update max PPS deviation → ${value} bps`
  }

  if (method === 'updateMaxNavStaleness') {
    const value = parameters.find((p) => p.name === '_maxNavStaleness')?.value ?? '?'
    return `Update max NAV staleness → ${value}s`
  }

  if (method === 'updateManagementFeeReceiver') {
    const addr = parameters.find((p) => p.name === '_managementFeeReceiver')?.value ?? ''
    return `Update management fee receiver → ${truncate(addr)}`
  }

  if (method === 'updateManagementFeeRate') {
    const value = parameters.find((p) => p.name === '_managementFeeRate')?.value ?? '?'
    return `Update management fee rate → ${value}`
  }

  if (method === 'updatePerformanceFeeReceiver') {
    const addr = parameters.find((p) => p.name === '_performanceFeeReceiver')?.value ?? ''
    return `Update performance fee receiver → ${truncate(addr)}`
  }

  if (method === 'updatePerformanceFeeRate') {
    const value = parameters.find((p) => p.name === '_performanceFeeRate')?.value ?? '?'
    return `Update performance fee rate → ${value}`
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

  if (method === 'changeThreshold') {
    const threshold =
      parameters.find((p) => p.name === '_threshold' || p.name === 'threshold')?.value ?? '?'
    return `Change Safe threshold → ${threshold}`
  }

  if (method === 'addOwnerWithThreshold') {
    const owner = parameters.find((p) => p.name === 'owner')?.value ?? ''
    const threshold =
      parameters.find((p) => p.name === '_threshold' || p.name === 'threshold')?.value ?? '?'
    return `Add Safe owner ${truncate(owner)} (threshold ${threshold})`
  }

  if (method === 'removeOwner') {
    const owner = parameters.find((p) => p.name === 'owner')?.value ?? ''
    return `Remove Safe owner ${truncate(owner)}`
  }

  if (method === 'swapOwner') {
    const oldOwner = parameters.find((p) => p.name === 'oldOwner')?.value ?? ''
    const newOwner = parameters.find((p) => p.name === 'newOwner')?.value ?? ''
    return `Swap Safe owner ${truncate(oldOwner)} → ${truncate(newOwner)}`
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

      return {
        method: functionName,
        parameters,
        abi:
          stringifyAbiJson(funcEntry ? [funcEntry] : undefined) ??
          synthesizeFunctionAbi(functionName, parameters),
      }
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

    return {
      method: functionName,
      parameters,
      abi:
        stringifyAbiJson(funcEntry ? [funcEntry] : undefined) ??
        synthesizeFunctionAbi(functionName, parameters),
    }
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

// ---------------------------------------------------------------------------
// Gnosis Safe owner / threshold methods (Harmonix often returns UNKNOWN_ABI)
// ---------------------------------------------------------------------------

const SAFE_MANAGEMENT_ABI = [
  {
    name: 'changeThreshold',
    type: 'function',
    inputs: [{ name: '_threshold', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'addOwnerWithThreshold',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'removeOwner',
    type: 'function',
    inputs: [
      { name: 'prevOwner', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'swapOwner',
    type: 'function',
    inputs: [
      { name: 'prevOwner', type: 'address' },
      { name: 'oldOwner', type: 'address' },
      { name: 'newOwner', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const
