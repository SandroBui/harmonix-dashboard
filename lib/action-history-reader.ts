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
  'depositNativeWithSlippage',
  'redeem',
  'initiateWithdrawal',
  'updateNav',
  'harvestPerformanceFee',
  'harvestManagementFee',
])

function mapFunctionToAction(fn: string): ActionType | null {
  switch (fn) {
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

function decodeTxEntry(
  tx: EtherscanTx,
  fundContract: string,
  fromTimestamp: number,
  toTimestamp: number,
): ActionHistoryEntry | null {
  const timestamp = Number(tx.timeStamp)
  if (timestamp < fromTimestamp || timestamp > toTimestamp) return null
  if (tx.isError === '1') return null
  if (!tx.input || tx.input === '0x' || tx.input.length < 10) return null
  if (tx.to?.toLowerCase() !== fundContract) return null

  try {
    const decoded = decodeFunctionData({
      abi: FUND_CONTRACT_ABI,
      data: tx.input as `0x${string}`,
    })
    if (!TRACKED_FUNCTIONS.has(decoded.functionName)) return null

    const action = mapFunctionToAction(decoded.functionName)
    if (!action) return null

    const txHash = tx.hash.toLowerCase()
    const from = tx.from.toLowerCase()

    switch (decoded.functionName) {
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
          logIndex: '0',
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
          logIndex: '0',
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
          logIndex: '0',
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
          logIndex: '0',
        }
      default:
        return null
    }
  } catch {
    return null
  }
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
    const txs = await fetchAllAddressTxs(fundContract, fromTimestamp)

    const entries = mergeEntries(
      txs
        .map((tx) => decodeTxEntry(tx, fundLower, fromTimestamp, toTimestamp))
        .filter((entry): entry is ActionHistoryEntry => entry !== null),
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
