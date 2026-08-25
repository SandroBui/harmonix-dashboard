import { decodeFunctionData } from 'viem'
import { BALANCE_CONTRACT_ABI, FUND_CONTRACT_ABI, HA_VAULT_READER_V2_ABI } from './contracts'
import { getPublicClient } from './client'
import {
  fetchFundAddressTxs,
  HyperEvmScanError,
  isHyperEvmScanConfigured,
  type EtherscanTx,
} from './hyperevmscan'
import { getBalanceContractAddress, getFundContractAddress } from './nav-contract-targets'
import type { VaultGroupConfig } from './vault-group-config'

export type WithdrawalV2Entry = {
  /** initiateWithdrawal tx hash. */
  initTxHash: string
  /** balanceContract executeAction → acquireWithdrawalFunds tx hash. */
  acquireTxHash: string | null
  /** redeem/withdraw tx hash when completed; null while still pending. */
  completionTxHash: string | null
  blockNumber: string
  controller: string
  shares: string
  minAssetsOut: string
  requestedAt: number
  /** User still has an active withdrawal (lockedShares > 0). */
  isPending: boolean
  /** Fund contract says user can call redeem/withdraw now. */
  canCompleteWithdraw: boolean
  withdrawAmount: string
}

export type WithdrawalsV2Data = {
  entries: WithdrawalV2Entry[]
  error: string | null
  fromTimestamp: number
  toTimestamp: number
  fetchedAt: number
  pendingCount: number
  completedCount: number
}

/** Rows per page in Withdrawals v2 UI. */
export const WITHDRAWALS_V2_PAGE_SIZE = 20

const INIT_FN = 'initiateWithdrawal'
const ACQUIRE_FN = 'acquireWithdrawalFunds'
const COMPLETION_FNS = new Set(['redeem', 'withdraw'])

/** Gnosis Safe execTransaction — acquire may be nested in `data`. */
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

export function parseWithdrawalsDaysParam(days: string | null | undefined): number {
  if (days === 'all') return 0
  const n = Number(days ?? 15)
  if (n === 7 || n === 15 || n === 30 || n === 90) return n
  return 15
}

type DecodedInit = {
  txHash: string
  blockNumber: string
  controller: string
  shares: string
  minAssetsOut: string
  requestedAt: number
}

type DecodedCompletion = {
  txHash: string
  owner: string
  timestamp: number
}

type DecodedAcquire = {
  txHash: string
  users: string[]
  timestamp: number
}

function getNewerInitTimestamp(init: DecodedInit, inits: DecodedInit[]): number | null {
  return inits
    .filter(
      (other) =>
        other.controller === init.controller &&
        other.requestedAt > init.requestedAt &&
        other.txHash !== init.txHash,
    )
    .reduce<number | null>((min, other) => {
      if (min === null || other.requestedAt < min) return other.requestedAt
      return min
    }, null)
}

function decodeInitTx(
  tx: EtherscanTx,
  fundContract: string,
  fromTimestamp: number,
  toTimestamp: number,
): DecodedInit | null {
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
    if (decoded.functionName !== INIT_FN) return null

    const args = decoded.args as readonly [bigint, bigint]
    return {
      txHash: tx.hash.toLowerCase(),
      blockNumber: tx.blockNumber,
      controller: tx.from.toLowerCase(),
      shares: args[0].toString(),
      minAssetsOut: args[1].toString(),
      requestedAt: timestamp,
    }
  } catch {
    return null
  }
}

function decodeCompletionTx(tx: EtherscanTx, fundContract: string): DecodedCompletion | null {
  if (tx.isError === '1') return null
  if (!tx.input || tx.input === '0x' || tx.input.length < 10) return null
  if (tx.to?.toLowerCase() !== fundContract) return null

  try {
    const decoded = decodeFunctionData({
      abi: FUND_CONTRACT_ABI,
      data: tx.input as `0x${string}`,
    })
    if (!COMPLETION_FNS.has(decoded.functionName)) return null

    const args = decoded.args as readonly [bigint, `0x${string}`, `0x${string}`]
    return {
      txHash: tx.hash.toLowerCase(),
      owner: args[2].toLowerCase(),
      timestamp: Number(tx.timeStamp),
    }
  } catch {
    return null
  }
}

function tryDecodeAcquireUsers(data: `0x${string}`): string[] | null {
  try {
    const decoded = decodeFunctionData({ abi: FUND_CONTRACT_ABI, data })
    if (decoded.functionName !== ACQUIRE_FN) return null
    const args = decoded.args as readonly [bigint, readonly `0x${string}`[], readonly bigint[]]
    return args[1].map((u) => u.toLowerCase())
  } catch {
    return null
  }
}

function tryDecodeAcquireViaBalance(data: `0x${string}`, fundLower: string): string[] | null {
  try {
    const decoded = decodeFunctionData({ abi: BALANCE_CONTRACT_ABI, data })
    if (decoded.functionName === 'executeAction') {
      const args = decoded.args as readonly [`0x${string}`, bigint, `0x${string}`]
      if (args[0].toLowerCase() !== fundLower) return null
      return tryDecodeAcquireUsers(args[2])
    }
    if (decoded.functionName === 'executeBatchActions') {
      const args = decoded.args as readonly [
        readonly `0x${string}`[],
        readonly bigint[],
        readonly `0x${string}`[],
      ]
      const users: string[] = []
      for (let i = 0; i < args[0].length; i++) {
        if (args[0][i].toLowerCase() !== fundLower) continue
        const batchUsers = tryDecodeAcquireUsers(args[2][i])
        if (batchUsers) users.push(...batchUsers)
      }
      return users.length > 0 ? users : null
    }
  } catch {
    return null
  }
  return null
}

function parseMultiSendCalls(bytesHex: string): Array<{ to: string; data: `0x${string}` }> {
  const hex = bytesHex.startsWith('0x') ? bytesHex.slice(2) : bytesHex
  const calls: Array<{ to: string; data: `0x${string}` }> = []
  let i = 0
  while (i < hex.length) {
    if (i + (1 + 20 + 32 + 32) * 2 > hex.length) break
    i += 2 // operation
    const to = `0x${hex.slice(i, i + 40)}`
    i += 40
    i += 64 // value
    const dataLen = parseInt(hex.slice(i, i + 64), 16)
    i += 64
    const data = `0x${hex.slice(i, i + dataLen * 2)}` as `0x${string}`
    i += dataLen * 2
    calls.push({ to: to.toLowerCase(), data })
  }
  return calls
}

/** Extract acquireWithdrawalFunds user list from nested calldata (fund, balance, Safe, multiSend). */
function tryDecodeAcquireFromCalldata(
  data: `0x${string}`,
  fundLower: string,
  balanceLower: string,
): string[] | null {
  const direct = tryDecodeAcquireUsers(data)
  if (direct) return direct

  const viaBalance = tryDecodeAcquireViaBalance(data, fundLower)
  if (viaBalance) return viaBalance

  try {
    const decoded = decodeFunctionData({ abi: MULTISEND_ABI, data })
    if (decoded.functionName === 'multiSend') {
      const users: string[] = []
      for (const call of parseMultiSendCalls(decoded.args[0] as string)) {
        const callTo = call.to.toLowerCase()
        if (callTo !== fundLower && callTo !== balanceLower) continue
        const innerUsers = tryDecodeAcquireFromCalldata(call.data, fundLower, balanceLower)
        if (innerUsers) users.push(...innerUsers)
      }
      return users.length > 0 ? users : null
    }
  } catch {
    /* not multiSend */
  }

  try {
    const decoded = decodeFunctionData({ abi: SAFE_EXEC_TRANSACTION_ABI, data })
    if (decoded.functionName === 'execTransaction') {
      const [to, , innerData] = decoded.args
      const toLower = to.toLowerCase()
      if (toLower !== fundLower && toLower !== balanceLower) return null
      return tryDecodeAcquireFromCalldata(innerData, fundLower, balanceLower)
    }
  } catch {
    /* not execTransaction */
  }

  return null
}

function decodeAcquireTx(
  tx: EtherscanTx,
  fundContract: string,
  balanceContract: string,
): DecodedAcquire | null {
  if (tx.isError === '1') return null
  if (!tx.input || tx.input === '0x' || tx.input.length < 10) return null

  const fundLower = fundContract.toLowerCase()
  const balanceLower = balanceContract.toLowerCase()
  const toLower = tx.to?.toLowerCase() ?? ''

  const canCarryAcquire =
    toLower === fundLower ||
    toLower === balanceLower ||
    tx.input.startsWith('0x6a761202')

  if (!canCarryAcquire) return null

  const users = tryDecodeAcquireFromCalldata(tx.input as `0x${string}`, fundLower, balanceLower)
  if (!users || users.length === 0) return null

  return {
    txHash: tx.hash.toLowerCase(),
    users,
    timestamp: Number(tx.timeStamp),
  }
}

function dedupeTxsByHash(txs: EtherscanTx[]): EtherscanTx[] {
  const byHash = new Map<string, EtherscanTx>()
  for (const tx of txs) {
    byHash.set(tx.hash.toLowerCase(), tx)
  }
  return [...byHash.values()]
}

function indexCompletionsByOwner(
  completions: DecodedCompletion[],
): Map<string, DecodedCompletion[]> {
  const byOwner = new Map<string, DecodedCompletion[]>()
  for (const c of completions) {
    const list = byOwner.get(c.owner)
    if (list) list.push(c)
    else byOwner.set(c.owner, [c])
  }
  for (const list of byOwner.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp)
  }
  return byOwner
}

function indexAcquiresByUser(acquires: DecodedAcquire[]): Map<string, DecodedAcquire[]> {
  const byUser = new Map<string, DecodedAcquire[]>()
  for (const acquire of acquires) {
    for (const user of acquire.users) {
      const list = byUser.get(user)
      if (list) list.push(acquire)
      else byUser.set(user, [acquire])
    }
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp)
  }
  return byUser
}

/** First redeem/withdraw after this init and before any newer init from the same user. */
function findCompletionTxHash(
  init: DecodedInit,
  inits: DecodedInit[],
  completionsByOwner: Map<string, DecodedCompletion[]>,
): string | null {
  const newerInitTs = getNewerInitTimestamp(init, inits)

  const completions = completionsByOwner.get(init.controller) ?? []
  const match = completions.find(
    (c) =>
      c.timestamp > init.requestedAt &&
      (newerInitTs === null || c.timestamp < newerInitTs),
  )

  return match?.txHash ?? null
}

/** First acquireWithdrawalFunds including this user after init and before any newer init. */
function findAcquireTxHash(
  init: DecodedInit,
  inits: DecodedInit[],
  acquiresByUser: Map<string, DecodedAcquire[]>,
): string | null {
  const newerInitTs = getNewerInitTimestamp(init, inits)

  const acquires = acquiresByUser.get(init.controller) ?? []
  const match = acquires.find(
    (a) =>
      a.timestamp > init.requestedAt &&
      (newerInitTs === null || a.timestamp < newerInitTs),
  )

  return match?.txHash ?? null
}

async function fetchOnChainWithdrawState(
  config: VaultGroupConfig,
  fundContract: `0x${string}`,
  users: string[],
): Promise<
  Map<
    string,
    {
      lockedShares: bigint
      canCompleteWithdraw: boolean
      withdrawAmount: bigint
    }
  >
> {
  if (users.length === 0) return new Map()

  const publicClient = getPublicClient()
  const { haVaultReaderAddress } = config
  const uniqueUsers = [...new Set(users.map((u) => u.toLowerCase()))]

  const results = await Promise.all(
    uniqueUsers.map(async (user) => {
      const [lockedShares, canCompleteWithdraw, withdrawal] = await Promise.all([
        publicClient.readContract({
          address: fundContract,
          abi: FUND_CONTRACT_ABI,
          functionName: 'lockedShares',
          args: [user as `0x${string}`],
        }),
        publicClient.readContract({
          address: fundContract,
          abi: FUND_CONTRACT_ABI,
          functionName: 'canCompleteWithdraw',
          args: [user as `0x${string}`],
        }),
        publicClient.readContract({
          address: haVaultReaderAddress,
          abi: HA_VAULT_READER_V2_ABI,
          functionName: 'getUserWithdrawal',
          args: [fundContract, user as `0x${string}`],
        }),
      ])

      return {
        user,
        lockedShares,
        canCompleteWithdraw,
        withdrawAmount: withdrawal.withdrawAmount,
      }
    }),
  )

  return new Map(
    results.map((r) => [
      r.user,
      {
        lockedShares: r.lockedShares,
        canCompleteWithdraw: r.canCompleteWithdraw,
        withdrawAmount: r.withdrawAmount,
      },
    ]),
  )
}

export async function getWithdrawalsV2(
  config: VaultGroupConfig,
  opts: { days?: number } = {},
): Promise<WithdrawalsV2Data> {
  const toTimestamp = Math.floor(Date.now() / 1000)
  const days = opts.days ?? 15
  const fromTimestamp = days > 0 ? toTimestamp - days * 86400 : 0
  const fetchedAt = Date.now()

  const emptyResult = (error: string | null): WithdrawalsV2Data => ({
    entries: [],
    error,
    fromTimestamp,
    toTimestamp,
    fetchedAt,
    pendingCount: 0,
    completedCount: 0,
  })

  if (!isHyperEvmScanConfigured()) {
    return emptyResult('HYPEREVMSCAN_API_KEY is not configured')
  }

  if (config.version !== 2) {
    return emptyResult('Withdrawals v2 reader is only available for v2 vaults')
  }

  try {
    const fundContract = getFundContractAddress(config)
    const balanceContract = getBalanceContractAddress(config)
    const fundLower = fundContract.toLowerCase()
    const balanceLower = balanceContract.toLowerCase()
    const scanOpts = {
      stopBeforeTimestamp: fromTimestamp > 0 ? fromTimestamp : undefined,
    }

    const [fundTxs, balanceTxs, safeTxs] = await Promise.all([
      fetchFundAddressTxs(fundContract, scanOpts),
      fetchFundAddressTxs(balanceContract, scanOpts),
      fetchFundAddressTxs(config.safe.default, scanOpts),
    ])

    const inits = fundTxs
      .map((tx) => decodeInitTx(tx, fundLower, fromTimestamp, toTimestamp))
      .filter((entry): entry is DecodedInit => entry !== null)
      .sort((a, b) => b.requestedAt - a.requestedAt)

    const completions = fundTxs
      .map((tx) => decodeCompletionTx(tx, fundLower))
      .filter((entry): entry is DecodedCompletion => entry !== null)

    const acquires = dedupeTxsByHash([...fundTxs, ...balanceTxs, ...safeTxs])
      .map((tx) => decodeAcquireTx(tx, fundLower, balanceLower))
      .filter((entry): entry is DecodedAcquire => entry !== null)

    const completionsByOwner = indexCompletionsByOwner(completions)
    const acquiresByUser = indexAcquiresByUser(acquires)

    const onChainState = await fetchOnChainWithdrawState(
      config,
      fundContract,
      inits.map((i) => i.controller),
    )

    const entries: WithdrawalV2Entry[] = inits.map((init) => {
      const state = onChainState.get(init.controller)
      const lockedShares = state?.lockedShares ?? 0n
      const canCompleteWithdraw = state?.canCompleteWithdraw ?? false
      const isPending = lockedShares > 0n
      const acquireTxHash = findAcquireTxHash(init, inits, acquiresByUser)
      const completionTxHash = !isPending
        ? findCompletionTxHash(init, inits, completionsByOwner)
        : null

      return {
        initTxHash: init.txHash,
        acquireTxHash,
        completionTxHash,
        blockNumber: init.blockNumber,
        controller: init.controller,
        shares: init.shares,
        minAssetsOut: init.minAssetsOut,
        requestedAt: init.requestedAt,
        isPending,
        canCompleteWithdraw,
        withdrawAmount: (state?.withdrawAmount ?? 0n).toString(),
      }
    })

    const pendingCount = entries.filter((e) => e.isPending).length

    return {
      entries,
      error: null,
      fromTimestamp,
      toTimestamp,
      fetchedAt,
      pendingCount,
      completedCount: entries.length - pendingCount,
    }
  } catch (err) {
    return {
      ...emptyResult(
        err instanceof HyperEvmScanError ? err.message : 'Failed to fetch pending withdrawals',
      ),
    }
  }
}
