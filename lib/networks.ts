/**
 * Networks the dashboard knows by chain id — used to name the vault's network in
 * the UI, to link block explorers, and to reach each chain's Safe Transaction
 * Service. Add an entry here before using a new chain in `lib/vaults.config.ts`.
 *
 * `safeShortName` is both the tx-service path segment
 * (`https://api.safe.global/tx-service/<shortName>/api`) and the prefix the Safe
 * web app expects in `?safe=<shortName>:<address>`.
 */
export type Network = {
  chainId: number
  name: string
  safeShortName: string
  /** Block explorer origin, no trailing slash. */
  explorer: string
}

export const NETWORKS: Network[] = [
  { chainId: 999, name: 'HyperEVM', safeShortName: 'hyper', explorer: 'https://hyperevmscan.io' },
  { chainId: 1, name: 'Ethereum', safeShortName: 'eth', explorer: 'https://etherscan.io' },
  { chainId: 42161, name: 'Arbitrum One', safeShortName: 'arb1', explorer: 'https://arbiscan.io' },
  { chainId: 8453, name: 'Base', safeShortName: 'base', explorer: 'https://basescan.org' },
  { chainId: 10, name: 'OP Mainnet', safeShortName: 'oeth', explorer: 'https://optimistic.etherscan.io' },
  { chainId: 137, name: 'Polygon', safeShortName: 'matic', explorer: 'https://polygonscan.com' },
  { chainId: 56, name: 'BNB Smart Chain', safeShortName: 'bnb', explorer: 'https://bscscan.com' },
  { chainId: 43114, name: 'Avalanche', safeShortName: 'avax', explorer: 'https://snowtrace.io' },
]

const BY_CHAIN_ID = new Map(NETWORKS.map((network) => [network.chainId, network]))

/** Safe tx-service short names keyed by chain id, for the server-side proxy. */
export const SAFE_SHORT_NAMES: Record<string, string> = Object.fromEntries(
  NETWORKS.map((network) => [String(network.chainId), network.safeShortName]),
)

export function getNetwork(chainId: number): Network | undefined {
  return BY_CHAIN_ID.get(chainId)
}

export function getNetworkName(chainId: number): string {
  return BY_CHAIN_ID.get(chainId)?.name ?? `Chain ${chainId}`
}

export function explorerTxUrl(chainId: number, txHash: string): string | null {
  const network = BY_CHAIN_ID.get(chainId)
  return network ? `${network.explorer}/tx/${txHash}` : null
}

/** Deep link to the Safe web app queue, used when the dashboard can't sign itself. */
export function safeAppQueueUrl(chainId: number, address: string): string | null {
  const network = BY_CHAIN_ID.get(chainId)
  return network
    ? `https://app.safe.global/transactions/queue?safe=${network.safeShortName}:${address}`
    : null
}
