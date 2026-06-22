/**
 * HyperEVM data via Etherscan API v2 (chainId 999).
 * @see https://docs.etherscan.io/api-reference/endpoint/balance
 * @see https://api.etherscan.io/v2/chainlist
 */

export const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api'
export const HYPEREVM_CHAIN_ID = 999

const CHAIN_ID = HYPEREVM_CHAIN_ID
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** Minimum gap between API calls to stay under free-tier rate limits. */
const MIN_REQUEST_GAP_MS = 500
let lastRequestAt = 0

export type EtherscanTx = {
  blockNumber: string
  timeStamp: string
  hash: string
  from: string
  to: string
  value: string
  input: string
  isError?: string
  txreceipt_status?: string
  functionName?: string
}

export type EtherscanLog = {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  timeStamp: string
  transactionHash: string
  logIndex: string
}

export class HyperEvmScanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HyperEvmScanError'
  }
}

function getApiKey(): string {
  const key = process.env.HYPEREVMSCAN_API_KEY
  if (!key) {
    throw new HyperEvmScanError(
      'HYPEREVMSCAN_API_KEY is not configured. Add it to .env to load action history data.',
    )
  }
  return key
}

export function buildEtherscanV2Url(params: Record<string, string>): string {
  const url = new URL(ETHERSCAN_V2_API)
  url.searchParams.set('chainid', String(CHAIN_ID))
  url.searchParams.set('apikey', getApiKey())
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastRequestAt
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsed))
  }
  lastRequestAt = Date.now()
}

async function apiRequest<T>(params: Record<string, string>): Promise<T> {
  await waitForRateLimit()

  const url = buildEtherscanV2Url(params)
  if (process.env.NODE_ENV === 'development') {
    const debugUrl = new URL(url)
    debugUrl.searchParams.set('apikey', '***')
    console.info('[etherscan-v2]', debugUrl.toString())
  }

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new HyperEvmScanError(`Etherscan API HTTP ${res.status}`)
  }

  const json = (await res.json()) as {
    status: string
    message: string
    result: T
  }

  if (json.status !== '1') {
    const msg = typeof json.result === 'string' ? json.result : json.message
    if (
      msg === 'No transactions found' ||
      msg === 'No records found' ||
      msg?.includes('No transactions found') ||
      msg?.includes('No records found')
    ) {
      return [] as T
    }
    throw new HyperEvmScanError(msg || json.message || 'Etherscan API request failed')
  }

  return json.result
}

const ETHERSCAN_PAGE_SIZE = 1000
const DEFAULT_MAX_TX_PAGES = 10

/** Re-use recent txlist responses to avoid repeated Etherscan pagination. */
export const TX_LIST_CACHE_TTL_MS = 60_000

type TxListCacheEntry = {
  fetchedAt: number
  stopBeforeTimestamp: number | null
  txs: EtherscanTx[]
}

const txListCache = new Map<string, TxListCacheEntry>()

function txListCacheKey(address: string, stopBeforeTimestamp: number | null): string {
  return `${address.toLowerCase()}:${stopBeforeTimestamp ?? 'all'}`
}

/**
 * Paginated txlist for a contract address (newest first).
 * Stops early once a page's oldest tx is before `stopBeforeTimestamp` (when set).
 */
export async function fetchFundAddressTxs(
  address: `0x${string}`,
  opts: {
    stopBeforeTimestamp?: number
    maxPages?: number
    pageSize?: number
    useCache?: boolean
  } = {},
): Promise<EtherscanTx[]> {
  const stopBeforeTimestamp = opts.stopBeforeTimestamp ?? null
  const maxPages = opts.maxPages ?? DEFAULT_MAX_TX_PAGES
  const pageSize = opts.pageSize ?? ETHERSCAN_PAGE_SIZE
  const useCache = opts.useCache ?? true
  const cacheKey = txListCacheKey(address, stopBeforeTimestamp)

  if (useCache) {
    const cached = txListCache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < TX_LIST_CACHE_TTL_MS) {
      return cached.txs
    }
  }

  const txs: EtherscanTx[] = []
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchAddressTxList({
      address,
      page,
      offset: pageSize,
      sort: 'desc',
    })
    txs.push(...batch)

    if (batch.length < pageSize) break

    if (stopBeforeTimestamp !== null && batch.length > 0) {
      const oldestInBatch = Number(batch[batch.length - 1].timeStamp)
      if (oldestInBatch < stopBeforeTimestamp) break
    }
  }

  if (useCache) {
    txListCache.set(cacheKey, {
      fetchedAt: Date.now(),
      stopBeforeTimestamp,
      txs,
    })
  }

  return txs
}

/** Normal transactions for an address (Etherscan account txlist). */
export async function fetchAddressTxList(params: {
  address: `0x${string}`
  startBlock?: bigint | number
  endBlock?: bigint | number
  page?: number
  offset?: number
  sort?: 'asc' | 'desc'
}): Promise<EtherscanTx[]> {
  const result = await apiRequest<EtherscanTx[] | EtherscanTx | string>({
    module: 'account',
    action: 'txlist',
    address: params.address,
    startblock: String(params.startBlock ?? 0),
    endblock: String(params.endBlock ?? 99999999),
    page: String(params.page ?? 1),
    offset: String(params.offset ?? 1000),
    sort: params.sort ?? 'desc',
  })
  if (!result || typeof result === 'string') return []
  return Array.isArray(result) ? result : [result]
}

/** Event logs emitted by a contract (optionally filtered by topic0). */
export async function fetchContractLogs(params: {
  address: `0x${string}`
  topic0?: `0x${string}`
  fromBlock?: bigint | number
  toBlock?: bigint | number
  page?: number
  offset?: number
}): Promise<EtherscanLog[]> {
  const query: Record<string, string> = {
    module: 'logs',
    action: 'getLogs',
    address: params.address,
    fromBlock: String(params.fromBlock ?? 0),
    toBlock: String(params.toBlock ?? 99999999),
    page: String(params.page ?? 1),
    offset: String(params.offset ?? 1000),
  }
  if (params.topic0) query.topic0 = params.topic0

  const result = await apiRequest<EtherscanLog[] | EtherscanLog | string>(query)
  if (!result || typeof result === 'string') return []
  return Array.isArray(result) ? result : [result]
}

export function isHyperEvmScanConfigured(): boolean {
  return Boolean(process.env.HYPEREVMSCAN_API_KEY)
}

export { ZERO_ADDRESS }
