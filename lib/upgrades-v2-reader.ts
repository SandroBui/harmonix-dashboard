import { decodeEventLog, getAddress } from 'viem'
import { HA_TIME_LOCK_ABI } from './abis/ha-time-lock'
import { getPublicClient } from './client'
import { getTimelockControllerAddress } from './nav-contract-targets'
import { OZ_DONE_TIMESTAMP } from './oz-timelock-roles'
import type { VaultGroupConfig } from './vault-group-config'
import {
  buildKnownContractsShell,
  decodeUpgradeCalldata,
  resolveKnownContracts,
  type DecodedUpgrade,
  type KnownContract,
  type UpgradeMode,
} from './upgrade-v2-calldata'

export type { DecodedUpgrade, KnownContract, UpgradeMode }
export { resolveKnownContracts }

/** HyperEVM has tens of millions of blocks — scanning from genesis hangs the UI. */
const TIMELOCK_LOG_LOOKBACK_BLOCKS = 100_000n
const LOG_CHUNK_SIZE = 1_000n

// ─── Types ────────────────────────────────────────────────────────────────────

export type UpgradeV2Operation = {
  id: `0x${string}`
  target: `0x${string}`
  value: string
  data: `0x${string}`
  predecessor: `0x${string}`
  salt: `0x${string}`
  scheduledAt: string
  delay: string
  executableAt: string
  state: 'Waiting' | 'Ready'
  decoded?: DecodedUpgrade
}

export type UpgradesV2PageData = {
  controllerAddress: `0x${string}` | null
  minDelay: string
  operations: UpgradeV2Operation[]
  knownContracts: KnownContract[]
  fetchedAt: number
}

type ScheduledEventMeta = {
  id: `0x${string}`
  target: `0x${string}`
  value: bigint
  data: `0x${string}`
  predecessor: `0x${string}`
  salt: `0x${string}`
  delay: bigint
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Instant shell data from vault config — no RPC. Used while pending ops load in background. */
export function getUpgradesV2ShellData(config: VaultGroupConfig): UpgradesV2PageData {
  let controllerAddress: `0x${string}` | null = null
  try {
    controllerAddress = getTimelockControllerAddress(config)
  } catch {
    controllerAddress = null
  }
  return {
    controllerAddress,
    minDelay: '0',
    operations: [],
    knownContracts: buildKnownContractsShell(config),
    fetchedAt: 0,
  }
}

async function fetchTimelockScheduledOps(
  controllerAddress: `0x${string}`,
): Promise<ScheduledEventMeta[]> {
  const publicClient = getPublicClient()
  const callScheduledEvent = {
    type: 'event' as const,
    name: 'CallScheduled',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'index', type: 'uint256', indexed: true },
      { name: 'target', type: 'address', indexed: false },
      { name: 'value', type: 'uint256', indexed: false },
      { name: 'data', type: 'bytes', indexed: false },
      { name: 'predecessor', type: 'bytes32', indexed: false },
      { name: 'delay', type: 'uint256', indexed: false },
    ],
  }
  const callSaltEvent = {
    type: 'event' as const,
    name: 'CallSalt',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'salt', type: 'bytes32', indexed: false },
    ],
  }

  const byId = new Map<string, ScheduledEventMeta>()
  const saltsById = new Map<string, `0x${string}`>()
  const latest = await publicClient.getBlockNumber()
  const startBlock =
    latest > TIMELOCK_LOG_LOOKBACK_BLOCKS ? latest - TIMELOCK_LOG_LOOKBACK_BLOCKS : 0n

  for (let to = latest; to >= startBlock; ) {
    const from = to >= LOG_CHUNK_SIZE ? to - LOG_CHUNK_SIZE + 1n : startBlock
    try {
      const [scheduledLogs, saltLogs] = await Promise.all([
        publicClient.getLogs({
          address: controllerAddress,
          event: callScheduledEvent,
          fromBlock: from,
          toBlock: to,
        }),
        publicClient.getLogs({
          address: controllerAddress,
          event: callSaltEvent,
          fromBlock: from,
          toBlock: to,
        }),
      ])
      for (const log of saltLogs) {
        try {
          const decoded = decodeEventLog({
            abi: HA_TIME_LOCK_ABI,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName !== 'CallSalt') continue
          const args = decoded.args as { id: `0x${string}`; salt: `0x${string}` }
          saltsById.set(args.id.toLowerCase(), args.salt)
        } catch {
          // skip malformed log
        }
      }
      for (const log of scheduledLogs) {
        try {
          const decoded = decodeEventLog({
            abi: HA_TIME_LOCK_ABI,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName !== 'CallScheduled') continue
          const args = decoded.args as {
            id: `0x${string}`
            target: `0x${string}`
            value: bigint
            data: `0x${string}`
            predecessor: `0x${string}`
            delay: bigint
          }
          const idKey = args.id.toLowerCase()
          byId.set(idKey, {
            id: args.id,
            target: getAddress(args.target) as `0x${string}`,
            value: args.value,
            data: args.data,
            predecessor: args.predecessor,
            salt:
              saltsById.get(idKey) ??
              '0x0000000000000000000000000000000000000000000000000000000000000000',
            delay: args.delay,
          })
        } catch {
          // skip malformed log
        }
      }
    } catch {
      // fail-soft per chunk — HyperEVM RPC limits log range
    }
    if (from <= startBlock) break
    to = from - 1n
  }

  for (const meta of byId.values()) {
    const salt = saltsById.get(meta.id.toLowerCase())
    if (salt) meta.salt = salt
  }

  return Array.from(byId.values())
}

// ─── Main reader ─────────────────────────────────────────────────────────────

export async function getUpgradesV2PageData(
  config: VaultGroupConfig,
  extraIds: readonly `0x${string}`[] = [],
  storedOps: readonly {
    id: `0x${string}`
    target: `0x${string}`
    value: string
    data: `0x${string}`
    predecessor: `0x${string}`
    salt: `0x${string}`
    delay: string
  }[] = [],
): Promise<UpgradesV2PageData> {
  const knownContracts = await resolveKnownContracts(config)

  let controllerAddress: `0x${string}` | null = null
  try {
    controllerAddress = getTimelockControllerAddress(config)
  } catch {
    return {
      controllerAddress: null,
      minDelay: '0',
      operations: [],
      knownContracts,
      fetchedAt: Date.now(),
    }
  }

  const publicClient = getPublicClient()

  const [minDelayRaw, eventMeta] = await Promise.all([
    publicClient.readContract({
      address: controllerAddress,
      abi: HA_TIME_LOCK_ABI,
      functionName: 'getMinDelay',
    }) as Promise<bigint>,
    fetchTimelockScheduledOps(controllerAddress).catch(() => [] as ScheduledEventMeta[]),
  ])

  const metaById = new Map<string, ScheduledEventMeta>()
  for (const m of eventMeta) metaById.set(m.id.toLowerCase(), m)
  // On-chain CallScheduled events are authoritative — localStorage only fills gaps.
  for (const op of storedOps) {
    const key = op.id.toLowerCase()
    if (metaById.has(key)) continue
    metaById.set(key, {
      id: op.id,
      target: getAddress(op.target) as `0x${string}`,
      value: BigInt(op.value),
      data: op.data,
      predecessor: op.predecessor,
      salt: op.salt,
      delay: BigInt(op.delay),
    })
  }
  for (const id of extraIds) {
    if (!metaById.has(id.toLowerCase())) {
      metaById.set(id.toLowerCase(), {
        id,
        target: '0x0000000000000000000000000000000000000000',
        value: 0n,
        data: '0x',
        predecessor:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
        delay: 0n,
      })
    }
  }

  const ids = Array.from(metaById.values()).map((m) => m.id)
  const [timestamps, readyFlags] =
    ids.length > 0
      ? await Promise.all([
          Promise.all(
            ids.map(async (id) => {
              try {
                const timestamp = (await publicClient.readContract({
                  address: controllerAddress!,
                  abi: HA_TIME_LOCK_ABI,
                  functionName: 'getTimestamp',
                  args: [id],
                })) as bigint
                return { ok: true as const, timestamp }
              } catch {
                return { ok: false as const }
              }
            }),
          ),
          Promise.all(
            ids.map(async (id) => {
              try {
                return (await publicClient.readContract({
                  address: controllerAddress!,
                  abi: HA_TIME_LOCK_ABI,
                  functionName: 'isOperationReady',
                  args: [id],
                })) as boolean
              } catch {
                return false
              }
            }),
          ),
        ])
      : [[], []]

  const operations: UpgradeV2Operation[] = []

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const tsResult = timestamps[i]
    if (!tsResult?.ok) continue
    const timestamp = tsResult.timestamp
    if (timestamp === OZ_DONE_TIMESTAMP || timestamp === 0n) continue

    const meta = metaById.get(id.toLowerCase())!
    if (meta.target === '0x0000000000000000000000000000000000000000') continue

    const executableAt = timestamp
    const scheduledAt = timestamp > meta.delay ? timestamp - meta.delay : 0n
    const isReady = readyFlags[i] === true
    const state: UpgradeV2Operation['state'] = isReady ? 'Ready' : 'Waiting'

    operations.push({
      id,
      target: meta.target,
      value: meta.value.toString(),
      data: meta.data,
      predecessor: meta.predecessor,
      salt: meta.salt,
      scheduledAt: scheduledAt.toString(),
      delay: meta.delay.toString(),
      executableAt: executableAt.toString(),
      state,
      decoded: decodeUpgradeCalldata(meta.target, meta.data),
    })
  }

  const STATE_ORDER: Record<UpgradeV2Operation['state'], number> = { Ready: 0, Waiting: 1 }
  operations.sort((a, b) => {
    const sd = STATE_ORDER[a.state] - STATE_ORDER[b.state]
    if (sd !== 0) return sd
    return Number(BigInt(b.scheduledAt) - BigInt(a.scheduledAt))
  })

  return {
    controllerAddress,
    minDelay: minDelayRaw.toString(),
    operations,
    knownContracts,
    fetchedAt: Date.now(),
  }
}
