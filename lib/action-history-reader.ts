import { decodeFunctionData } from 'viem'
import { FUND_CONTRACT_ABI } from './contracts'
import {
  fetchFundAddressTxs,
  HyperEvmScanError,
  isHyperEvmScanConfigured,
  type EtherscanTx,
} from './hyperevmscan'
import { getFundContractAddress } from './nav-contract-targets'
import type { VaultGroupConfig } from './vault-group-config'

/** Gnosis Safe execTransaction — fund actions may be nested in `data`. */
const SAFE_EXEC_TRANSACTION_ABI = [
  {
    type: 'function',
    name: 'execTransaction',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'payable',
  },
] as const

const MULTISEND_ABI = [
  {
    type: 'function',
    name: 'multiSend',
    inputs: [{ name: 'transactions', type: 'bytes' }],
    outputs: [],
    stateMutability: 'payable',
  },
] as const

type FundInnerCall = {
  to: string
  data: `0x${string}`
}

function collectVaultSafeAddresses(config: VaultGroupConfig): Set<string> {
  const safes = new Set<string>()
  const add = (address?: `0x${string}`) => {
    if (!address) return
    const lower = address.toLowerCase()
    if (lower !== '0x0000000000000000000000000000000000000000') safes.add(lower)
  }
  add(config.safe.default)
  add(config.safe.operator)
  add(config.safe.curator)
  add(config.safe.admin)
  add(config.safe.timelockProposer)
  return safes
}

function parseMultiSendCalls(bytesHex: string): FundInnerCall[] {
  const hex = bytesHex.startsWith('0x') ? bytesHex.slice(2) : bytesHex
  const calls: FundInnerCall[] = []
  let i = 0
  while (i < hex.length) {
    if (i + (1 + 20 + 32 + 32) * 2 > hex.length) break
    i += 2 // operation
    const to = `0x${hex.slice(i, i + 40)}`.toLowerCase()
    i += 40
    i += 64 // value
    const dataLen = parseInt(hex.slice(i, i + 64), 16)
    i += 64
    const data = `0x${hex.slice(i, i + dataLen * 2)}` as `0x${string}`
    i += dataLen * 2
    calls.push({ to, data })
  }
  return calls
}

/** Walk Safe execTransaction / multiSend trees and return inner calls to `fundLower`. */
function collectFundInnerCalls(data: `0x${string}`, fundLower: string): FundInnerCall[] {
  try {
    const decoded = decodeFunctionData({ abi: FUND_CONTRACT_ABI, data })
    if (TRACKED_FUNCTIONS.has(decoded.functionName)) {
      return [{ to: fundLower, data }]
    }
  } catch {
    /* not a direct fund call */
  }

  try {
    const decoded = decodeFunctionData({ abi: MULTISEND_ABI, data })
    if (decoded.functionName === 'multiSend') {
      const calls: FundInnerCall[] = []
      for (const call of parseMultiSendCalls(decoded.args[0] as string)) {
        if (call.to === fundLower) {
          calls.push(call)
          continue
        }
        calls.push(...collectFundInnerCalls(call.data, fundLower))
      }
      return calls
    }
  } catch {
    /* not multiSend */
  }

  try {
    const decoded = decodeFunctionData({ abi: SAFE_EXEC_TRANSACTION_ABI, data })
    if (decoded.functionName === 'execTransaction') {
      const innerData = decoded.args[2] as `0x${string}`
      return collectFundInnerCalls(innerData, fundLower)
    }
  } catch {
    /* not execTransaction */
  }

  return []
}

function dedupeTxsByHash(txs: EtherscanTx[]): EtherscanTx[] {
  const byHash = new Map<string, EtherscanTx>()
  for (const tx of txs) {
    byHash.set(tx.hash.toLowerCase(), tx)
  }
  return [...byHash.values()]
}

export type ActionType =
  | 'deposit'
  | 'redeem'
  | 'initiateWithdrawal'
  | 'updateNav'
  | 'harvestPerformanceFee'
  | 'harvestManagementFee'

export type ActionHistoryEntry = {
  action: ActionType
  txHash: string
  blockNumber: string
  timestamp: number
  primaryAddress: string
  secondaryAddress?: string
  amount: string
  shares?: string
  logIndex: string
}

export type ActionHistoryData = {
  entries: ActionHistoryEntry[]
  error: string | null
  fromTimestamp: number
  toTimestamp: number
  fetchedAt: number
}

/** Rows per page in Action History UI. */
export const ACTION_HISTORY_PAGE_SIZE = 20

/** FundContract functions shown in Action History (decoded from tx input). */
const TRACKED_FUNCTIONS = new Set([
  'deposit',
  'depositWithSlippage',
  'depositNativeWithSlippage',
  'redeem',
  'initiateWithdrawal',
  'updateNav',
  'harvestPerformanceFee',
  'harvestManagementFee',
])

function mapFunctionToAction(fn: string): ActionType | null {
  switch (fn) {
    case 'deposit':
    case 'depositWithSlippage':
    case 'depositNativeWithSlippage':
      return 'deposit'
    case 'redeem':
      return 'redeem'
    case 'initiateWithdrawal':
      return 'initiateWithdrawal'
    case 'updateNav':
      return 'updateNav'
    case 'harvestPerformanceFee':
      return 'harvestPerformanceFee'
    case 'harvestManagementFee':
      return 'harvestManagementFee'
    default:
      return null
  }
}

function entryKey(entry: Pick<ActionHistoryEntry, 'txHash' | 'logIndex' | 'action'>) {
  return `${entry.txHash}:${entry.logIndex}:${entry.action}`
}

function buildEntryFromDecoded(
  decoded: ReturnType<typeof decodeFunctionData>,
  tx: EtherscanTx,
  timestamp: number,
  actor: string,
  logIndex: string,
): ActionHistoryEntry | null {
  if (!TRACKED_FUNCTIONS.has(decoded.functionName)) return null

  const action = mapFunctionToAction(decoded.functionName)
  if (!action) return null

  const txHash = tx.hash.toLowerCase()
  const from = actor.toLowerCase()

  switch (decoded.functionName) {
    case 'deposit': {
      const args = decoded.args as readonly [bigint, `0x${string}`]
      const amount = args[0]
      const receiver = args[1].toLowerCase()
      return {
        action,
        txHash,
        blockNumber: tx.blockNumber,
        timestamp,
        primaryAddress: receiver,
        secondaryAddress: from !== receiver ? from : undefined,
        amount: amount.toString(),
        logIndex,
      }
    }
    case 'depositWithSlippage':
    case 'depositNativeWithSlippage': {
      const args = decoded.args as readonly [bigint, `0x${string}`, bigint]
      const amount = args[0]
      const receiver = args[1].toLowerCase()
      const minSharesOut = args[2]
      return {
        action,
        txHash,
        blockNumber: tx.blockNumber,
        timestamp,
        primaryAddress: receiver,
        secondaryAddress: from !== receiver ? from : undefined,
        amount: amount.toString(),
        shares: minSharesOut.toString(),
        logIndex,
      }
    }
    case 'redeem': {
      const args = decoded.args as readonly [bigint, `0x${string}`, `0x${string}`]
      const shares = args[0]
      const receiver = args[1].toLowerCase()
      const owner = args[2].toLowerCase()
      return {
        action,
        txHash,
        blockNumber: tx.blockNumber,
        timestamp,
        primaryAddress: owner,
        secondaryAddress: receiver !== owner ? receiver : undefined,
        amount: '0',
        shares: shares.toString(),
        logIndex,
      }
    }
    case 'initiateWithdrawal': {
      const args = decoded.args as readonly [bigint, bigint]
      return {
        action,
        txHash,
        blockNumber: tx.blockNumber,
        timestamp,
        primaryAddress: from,
        amount: args[1].toString(),
        shares: args[0].toString(),
        logIndex,
      }
    }
    case 'updateNav':
    case 'harvestPerformanceFee':
    case 'harvestManagementFee':
      return {
        action,
        txHash,
        blockNumber: tx.blockNumber,
        timestamp,
        primaryAddress: from,
        amount: '0',
        logIndex,
      }
    default:
      return null
  }
}

function decodeFundCalldataEntry(
  tx: EtherscanTx,
  calldata: `0x${string}`,
  fromTimestamp: number,
  toTimestamp: number,
  logIndex: string,
  actor: string,
): ActionHistoryEntry | null {
  const timestamp = Number(tx.timeStamp)
  if (timestamp < fromTimestamp || timestamp > toTimestamp) return null
  if (tx.isError === '1') return null
  if (!calldata || calldata === '0x' || calldata.length < 10) return null

  try {
    const decoded = decodeFunctionData({
      abi: FUND_CONTRACT_ABI,
      data: calldata,
    })
    return buildEntryFromDecoded(decoded, tx, timestamp, actor, logIndex)
  } catch {
    return null
  }
}

function decodeTxEntries(
  tx: EtherscanTx,
  fundContract: string,
  safeAddresses: Set<string>,
  fromTimestamp: number,
  toTimestamp: number,
): ActionHistoryEntry[] {
  const timestamp = Number(tx.timeStamp)
  if (timestamp < fromTimestamp || timestamp > toTimestamp) return []
  if (tx.isError === '1') return []
  if (!tx.input || tx.input === '0x' || tx.input.length < 10) return []

  const entries: ActionHistoryEntry[] = []
  const fundLower = fundContract.toLowerCase()
  const txTo = tx.to?.toLowerCase() ?? ''

  if (txTo === fundLower) {
    const direct = decodeFundCalldataEntry(
      tx,
      tx.input as `0x${string}`,
      fromTimestamp,
      toTimestamp,
      '0',
      tx.from,
    )
    if (direct) entries.push(direct)
    return entries
  }

  if (safeAddresses.has(txTo) || tx.input.startsWith('0x6a761202')) {
    const innerCalls = collectFundInnerCalls(tx.input as `0x${string}`, fundLower)
    innerCalls.forEach((call, idx) => {
      const entry = decodeFundCalldataEntry(
        tx,
        call.data,
        fromTimestamp,
        toTimestamp,
        `safe:${idx}`,
        tx.from,
      )
      if (entry) entries.push(entry)
    })
  }

  return entries
}

function mergeEntries(entries: ActionHistoryEntry[]): ActionHistoryEntry[] {
  const byKey = new Map<string, ActionHistoryEntry>()
  for (const entry of entries) {
    byKey.set(entryKey(entry), entry)
  }
  return [...byKey.values()].sort((a, b) => {
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp
    return Number(b.blockNumber) - Number(a.blockNumber)
  })
}

async function fetchAllAddressTxs(
  fundContract: `0x${string}`,
  stopBeforeTimestamp: number,
): Promise<Awaited<ReturnType<typeof fetchFundAddressTxs>>> {
  return fetchFundAddressTxs(fundContract, {
    stopBeforeTimestamp: stopBeforeTimestamp > 0 ? stopBeforeTimestamp : undefined,
  })
}

export async function getActionHistory(
  config: VaultGroupConfig,
  opts: { days?: number } = {},
): Promise<ActionHistoryData> {
  const toTimestamp = Math.floor(Date.now() / 1000)
  const days = opts.days ?? 30
  const fromTimestamp = days > 0 ? toTimestamp - days * 86400 : 0
  const fetchedAt = Date.now()

  if (!isHyperEvmScanConfigured()) {
    return {
      entries: [],
      error: 'HYPEREVMSCAN_API_KEY is not configured',
      fromTimestamp,
      toTimestamp,
      fetchedAt,
    }
  }

  if (config.version !== 2) {
    return {
      entries: [],
      error: 'Action history is only available for v2 vaults',
      fromTimestamp,
      toTimestamp,
      fetchedAt,
    }
  }

  try {
    const fundContract = getFundContractAddress(config)
    const fundLower = fundContract.toLowerCase()
    const safeAddresses = collectVaultSafeAddresses(config)

    const fundTxs = await fetchAllAddressTxs(fundContract, fromTimestamp)
    const safeTxBatches = await Promise.all(
      [...safeAddresses].map((safe) =>
        fetchAllAddressTxs(safe as `0x${string}`, fromTimestamp),
      ),
    )
    const txs = dedupeTxsByHash([...fundTxs, ...safeTxBatches.flat()])

    const entries = mergeEntries(
      txs.flatMap((tx) => decodeTxEntries(tx, fundLower, safeAddresses, fromTimestamp, toTimestamp)),
    )

    return {
      entries,
      error: null,
      fromTimestamp,
      toTimestamp,
      fetchedAt,
    }
  } catch (err) {
    return {
      entries: [],
      error: err instanceof HyperEvmScanError ? err.message : 'Failed to fetch action history',
      fromTimestamp,
      toTimestamp,
      fetchedAt,
    }
  }
}
