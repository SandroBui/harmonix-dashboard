/**
 * Re-exports the shared network map for Safe Transaction Service callers.
 * Prefer importing from `@/lib/networks` for display (vault network badge, etc.).
 */
export {
  NETWORKS as SAFE_CHAINS,
  SAFE_SHORT_NAMES,
  getNetwork as getSafeChain,
  getNetworkName as getSafeChainLabel,
  explorerTxUrl as safeTxExplorerUrl,
  safeAppQueueUrl,
  type Network as SafeChain,
} from '@/lib/networks'
