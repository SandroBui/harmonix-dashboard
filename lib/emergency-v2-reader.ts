import { decodeFunctionData, type Abi } from 'viem'
import { FUND_CONTRACT_ABI } from './abis'
import {
  fetchFundAddressTxs,
  HyperEvmScanError,
  isHyperEvmScanConfigured,
  type EtherscanTx,
} from './hyperevmscan'
import { getFundContractAddress } from './nav-contract-targets'
import { getDefaultSafeAddress } from './safe/roles'
import type { VaultGroupConfig } from './vault-group-config'

export type EmergencyV2ContractKey = 'fund'

export type EmergencyV2ContractEntry = {
  key: EmergencyV2ContractKey
  label: string
  address: string
  configured: boolean
  /** null when scan unavailable or not yet loaded */
  isPaused: boolean | null
  lastTxHash: string | null
  lastTimestamp: number | null
}

export type EmergencyV2SafeOption = {
  label: string
  address: string
}

export type EmergencyV2PageData = {
  contracts: EmergencyV2ContractEntry[]
  safes: EmergencyV2SafeOption[]
  scanError: string | null
  fetchedAt: number
}

export type EmergencyV2PauseStatusData = {
  contracts: Pick<EmergencyV2ContractEntry, 'key' | 'isPaused' | 'lastTxHash' | 'lastTimestamp'>[]
  scanError: string | null
  fetchedAt: number
}

const CONTRACT_ABIS: Record<EmergencyV2ContractKey, Abi> = {
  fund: FUND_CONTRACT_ABI,
}

const PAUSE_STATE_CACHE_TTL_MS = 30_000

type PauseCacheEntry = {
  fetchedAt: number
  isPaused: boolean
  lastTxHash: string | null
  lastTimestamp: number | null
}

const pauseStateCache = new Map<string, PauseCacheEntry>()

function buildContracts(config: VaultGroupConfig): EmergencyV2ContractEntry[] {
  const fundContractAddress = getFundContractAddress(config)

  return [
    {
      key: 'fund',
      label: 'Fund Contract',
      address: fundContractAddress.toLowerCase(),
      configured: true,
      isPaused: null,
      lastTxHash: null,
      lastTimestamp: null,
    },
  ]
}

function buildSafes(config: VaultGroupConfig): EmergencyV2SafeOption[] {
  const safeEntries: EmergencyV2SafeOption[] = []
  const seen = new Set<string>()
  const candidates: { label: string; address?: `0x${string}` }[] = [
    { label: 'Default Safe', address: config.safe.default },
    { label: 'Operator Safe', address: config.safe.operator },
    { label: 'Admin Safe', address: config.safe.admin },
  ]
  for (const { label, address } of candidates) {
    const resolved = address ?? getDefaultSafeAddress(config)
    const lower = resolved.toLowerCase()
    if (seen.has(lower) || lower === '0x0000000000000000000000000000000000000000') continue
    seen.add(lower)
    safeEntries.push({ label, address: resolved })
  }
  return safeEntries
}

function decodeSetPausedTx(
  tx: EtherscanTx,
  contractAddress: string,
  abi: Abi,
): { isPaused: boolean; txHash: string; timestamp: number } | null {
  if (tx.isError === '1') return null
  if (!tx.input || tx.input === '0x' || tx.input.length < 10) return null
  if (tx.to?.toLowerCase() !== contractAddress) return null

  try {
    const decoded = decodeFunctionData({
      abi,
      data: tx.input as `0x${string}`,
    })
    if (decoded.functionName !== 'setPaused') return null
    if (decoded.args === undefined) return null
    const paused = decoded.args[0] as boolean
    return {
      isPaused: paused,
      txHash: tx.hash.toLowerCase(),
      timestamp: Number(tx.timeStamp),
    }
  } catch {
    return null
  }
}

function getCachedPauseState(address: string): PauseCacheEntry | null {
  const cached = pauseStateCache.get(address.toLowerCase())
  if (!cached) return null
  if (Date.now() - cached.fetchedAt > PAUSE_STATE_CACHE_TTL_MS) {
    pauseStateCache.delete(address.toLowerCase())
    return null
  }
  return cached
}

function setCachedPauseState(
  address: string,
  state: Pick<PauseCacheEntry, 'isPaused' | 'lastTxHash' | 'lastTimestamp'>,
): void {
  pauseStateCache.set(address.toLowerCase(), {
    fetchedAt: Date.now(),
    ...state,
  })
}

export function invalidateEmergencyV2PauseCache(address?: string): void {
  if (address) {
    pauseStateCache.delete(address.toLowerCase())
    return
  }
  pauseStateCache.clear()
}

async function inferPauseState(
  contractAddress: `0x${string}`,
  abi: Abi,
  opts: { bypassCache?: boolean } = {},
): Promise<Pick<EmergencyV2ContractEntry, 'isPaused' | 'lastTxHash' | 'lastTimestamp'>> {
  const lower = contractAddress.toLowerCase()

  if (!opts.bypassCache) {
    const cached = getCachedPauseState(lower)
    if (cached) {
      return {
        isPaused: cached.isPaused,
        lastTxHash: cached.lastTxHash,
        lastTimestamp: cached.lastTimestamp,
      }
    }
  }

  // Most recent setPaused tx should appear in the first page of contract txs.
  const txs = await fetchFundAddressTxs(contractAddress, {
    maxPages: 1,
    useCache: !opts.bypassCache,
  })

  for (const tx of txs) {
    const decoded = decodeSetPausedTx(tx, lower, abi)
    if (decoded) {
      const state = {
        isPaused: decoded.isPaused,
        lastTxHash: decoded.txHash,
        lastTimestamp: decoded.timestamp,
      }
      setCachedPauseState(lower, state)
      return state
    }
  }

  const state = {
    isPaused: false,
    lastTxHash: null,
    lastTimestamp: null,
  }
  setCachedPauseState(lower, state)
  return state
}

/** Fast page shell — pause state is loaded client-side via /api/emergency/v2/pause-status. */
export async function getEmergencyV2PageData(config: VaultGroupConfig): Promise<EmergencyV2PageData> {
  if (config.version !== 2) {
    throw new Error(`getEmergencyV2PageData is only for v2 vaults (got version ${config.version})`)
  }

  return {
    contracts: buildContracts(config),
    safes: buildSafes(config),
    scanError: null,
    fetchedAt: Date.now(),
  }
}

export async function getEmergencyV2PauseStatus(
  config: VaultGroupConfig,
  opts: { bypassCache?: boolean } = {},
): Promise<EmergencyV2PauseStatusData> {
  if (config.version !== 2) {
    throw new Error(`getEmergencyV2PauseStatus is only for v2 vaults (got version ${config.version})`)
  }

  const contracts = buildContracts(config)
  const configured = contracts.filter((c) => c.configured)

  if (!isHyperEvmScanConfigured()) {
    return {
      contracts: configured.map((c) => ({
        key: c.key,
        isPaused: null,
        lastTxHash: null,
        lastTimestamp: null,
      })),
      scanError: 'HYPEREVMSCAN_API_KEY is not configured. Pause state cannot be inferred from chain history.',
      fetchedAt: Date.now(),
    }
  }

  if (opts.bypassCache) {
    for (const contract of configured) {
      invalidateEmergencyV2PauseCache(contract.address)
    }
  }

  let scanError: string | null = null
  const results = await Promise.allSettled(
    configured.map(async (contract) => {
      const abi = CONTRACT_ABIS[contract.key]
      const pauseState = await inferPauseState(contract.address as `0x${string}`, abi, opts)
      return { key: contract.key, ...pauseState }
    }),
  )

  const pauseContracts: EmergencyV2PauseStatusData['contracts'] = configured.map((c) => ({
    key: c.key,
    isPaused: null,
    lastTxHash: null,
    lastTimestamp: null,
  }))

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const entry = pauseContracts.find((c) => c.key === result.value.key)
      if (entry) {
        entry.isPaused = result.value.isPaused
        entry.lastTxHash = result.value.lastTxHash
        entry.lastTimestamp = result.value.lastTimestamp
      }
    } else {
      const err = result.reason
      scanError =
        err instanceof HyperEvmScanError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to scan pause history'
    }
  }

  return {
    contracts: pauseContracts,
    scanError,
    fetchedAt: Date.now(),
  }
}
