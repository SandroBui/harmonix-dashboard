import { createPublicClient, http } from 'viem'
import { HA_VAULT_READER_ADDRESS, HA_VAULT_READER_ABI, ASSET_METADATA, FUND_NAV_FEED_ADDRESS, FUND_NAV_FEED_ABI } from './contracts'
import { hyperEvmMainnet } from './wagmi-config'
import { getAllWithdrawals } from './vault-reader'

const publicClient = createPublicClient({
  chain: hyperEvmMainnet,
  transport: http(),
})

// Minimal ERC-20 ABI — only balanceOf is needed
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

// ─── Serialisable output types (no bigints) ───────────────────────────────────

export type StrategyAllocation = {
  address: string
  allocated: string // raw integer string
}

export type VaultOverviewData = {
  vault: string
  asset: string
  symbol: string
  decimals: number
  // Redemption state
  redeemShares: string
  claimableAssets: string
  pendingAssets: string
  // Current asset token balance held by the vault contract
  vaultAssetBalance: string
  // Current asset token balance held by the FundVault contract
  fundVaultBalance: string
  // NAV value reported by the FundNavFeed contract per asset
  fundNavBalance: string
  // NAV
  navAsset: string
  navDenomination: string
  // Pause state
  isPaused: boolean
  // Capital breakdown (from FundVault)
  idleAssets: string
  totalManagedAssets: string
  deployedAssets: string // totalManaged - idle (may be negative if rounding, clamp to 0)
  strategies: StrategyAllocation[]
}

export type NavSnapshotData = {
  totalSupply: string
  navDenomination: string
  effNavDenomination: string
  globalRedeemShares: string
  assetTotalNavs: string[]
  ppsValue: string
  isValidPps: boolean
}

export type FundStatusData = {
  vaults: VaultOverviewData[]
  navSnapshot: NavSnapshotData
  redeemQueueLength: number
  redeemMode: number // 0 = Global, 1 = PerAsset
  pricePerShare: string
  // Aggregated totals (raw integer strings)
  totalPendingAssets: string
  totalClaimableAssets: string
  totalRedeemShares: string
  pausedVaultCount: number
  // Queue breakdown — only entries where shares > 0
  redeemActiveCount: number    // shares > 0 && !isFulfilled
  redeemFulfilledCount: number // shares > 0 && isFulfilled
  fetchedAt: number // Date.now() — used by client for "updated Xs ago" display
}

// ─── Typed readContract helper ────────────────────────────────────────────────

function read<F extends 'getAllVaultOverviews' | 'getNavSnapshot' | 'getRedeemQueueLength' | 'getRedeemMode' | 'getPricePerShare' | 'getFundVault' | 'getFundNav'>(
  functionName: F,
): ReturnType<typeof publicClient.readContract>
function read<F extends 'getIdleAssets' | 'getTotalManagedAssets' | 'getStrategies' | 'getAllocated'>(
  functionName: F,
  args: [`0x${string}`],
): ReturnType<typeof publicClient.readContract>
function read(functionName: string, args?: unknown[]) {
  return publicClient.readContract({
    address: HA_VAULT_READER_ADDRESS,
    abi: HA_VAULT_READER_ABI,
    functionName: functionName as never,
    ...(args ? { args: args as never } : {}),
  })
}

// ─── Main fetch function ──────────────────────────────────────────────────────

/**
 * Fetches the complete Harmonix architecture status using parallel Promise.all
 * calls (HyperEVM does not have the multicall3 contract deployed).
 *
 * Batch 1: Global fund state — 5 parallel readContract calls
 * Batch 2: Per-asset capital breakdown — 3N parallel calls for N assets
 * Batch 3: Per-strategy allocations — M parallel calls (skipped if none)
 */
export async function getFundStatus(): Promise<FundStatusData> {
  // ── Batch 1: global state (all in parallel) ───────────────────────────────
  const [overviews, nav, queueLen, redeemMode, pps, fundVaultAddress, fundNavAddress, allWithdrawals] = await Promise.all([
    read('getAllVaultOverviews') as Promise<readonly {
      vault: `0x${string}`
      asset: `0x${string}`
      redeemShares: bigint
      claimableAssets: bigint
      pendingAssets: bigint
      navAsset: bigint
      navDenomination: bigint
      isPaused: boolean
    }[]>,
    read('getNavSnapshot') as Promise<{
      totalSupply: bigint
      navDenomination: bigint
      effNavDenomination: bigint
      globalRedeemShares: bigint
      assetTotalNavs: readonly bigint[]
      ppsValue: bigint
      isValidPps: boolean
    }>,
    read('getRedeemQueueLength') as Promise<bigint>,
    read('getRedeemMode') as Promise<number>,
    read('getPricePerShare') as Promise<bigint>,
    read('getFundVault') as Promise<`0x${string}`>,
    read('getFundNav') as Promise<`0x${string}`>,
    getAllWithdrawals(),
  ])

  const assets = overviews.map((o) => o.asset)

  // ── Batch 2: per-asset capital breakdown + vault asset balances (all in parallel) ──
  const [idleAmounts, totalManagedAmounts, strategyLists, vaultAssetBalances, fundVaultBalances, fundNavBalances] = assets.length > 0
    ? await Promise.all([
        Promise.all(assets.map((asset) => read('getIdleAssets', [asset]) as Promise<bigint>)),
        Promise.all(assets.map((asset) => read('getTotalManagedAssets', [asset]) as Promise<bigint>)),
        Promise.all(assets.map((asset) => read('getStrategies', [asset]) as Promise<readonly `0x${string}`[]>)),
        // balanceOf(vault) — liquid assets the VaultAsset contract holds
        Promise.all(overviews.map((o) =>
          publicClient.readContract({
            address: o.asset,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [o.vault],
          }) as Promise<bigint>
        )),
        // balanceOf(fundVault) — assets held by the FundVault contract per asset token
        Promise.all(overviews.map((o) =>
          publicClient.readContract({
            address: o.asset,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [fundVaultAddress],
          }) as Promise<bigint>
        )),
        // fundNavValue(asset) — NAV tracked in FundNavFeed per asset
        Promise.all(overviews.map((o) =>
          publicClient.readContract({
            address: FUND_NAV_FEED_ADDRESS,
            abi: FUND_NAV_FEED_ABI,
            functionName: 'fundNavValue',
            args: [o.asset],
          }) as Promise<bigint>
        )),
      ])
    : [[], [], [], [], [], []]

  // ── Batch 3: per-strategy allocations (all in parallel) ──────────────────
  const allStrategies = (strategyLists as unknown as `0x${string}`[][]).flat()
  const allAllocations: bigint[] = allStrategies.length > 0
    ? await Promise.all(
        allStrategies.map((strategy) => read('getAllocated', [strategy]) as Promise<bigint>),
      )
    : []

  // ── Assemble per-vault data ───────────────────────────────────────────────
  let globalStrategyIdx = 0

  const vaults: VaultOverviewData[] = overviews.map((o, i) => {
    const assetAddr = o.asset.toLowerCase()
    const meta = ASSET_METADATA[assetAddr] ?? { symbol: assetAddr.slice(0, 10), decimals: 18 }

    const idle: bigint = (idleAmounts as bigint[])[i] ?? 0n
    const totalManaged: bigint = (totalManagedAmounts as bigint[])[i] ?? 0n
    const deployed = totalManaged > idle ? totalManaged - idle : 0n
    const vaultAssetBalance: bigint = (vaultAssetBalances as bigint[])[i] ?? 0n
    const fundVaultBalance: bigint = (fundVaultBalances as bigint[])[i] ?? 0n
    const fundNavBalance: bigint = (fundNavBalances as bigint[])[i] ?? 0n

    const vaultStrategyList = ((strategyLists as unknown as `0x${string}`[][])[i] ?? []) as `0x${string}`[]
    const strategies: StrategyAllocation[] = vaultStrategyList.map((addr) => ({
      address: addr.toLowerCase(),
      allocated: (allAllocations[globalStrategyIdx++] ?? 0n).toString(),
    }))

    return {
      vault: o.vault.toLowerCase(),
      asset: assetAddr,
      symbol: meta.symbol,
      decimals: meta.decimals,
      redeemShares: o.redeemShares.toString(),
      claimableAssets: o.claimableAssets.toString(),
      pendingAssets: o.pendingAssets.toString(),
      vaultAssetBalance: vaultAssetBalance.toString(),
      fundVaultBalance: fundVaultBalance.toString(),
      fundNavBalance: fundNavBalance.toString(),
      navAsset: o.navAsset.toString(),
      navDenomination: o.navDenomination.toString(),
      isPaused: o.isPaused,
      idleAssets: idle.toString(),
      totalManagedAssets: totalManaged.toString(),
      deployedAssets: deployed.toString(),
      strategies,
    }
  })

  // ── Aggregate totals ──────────────────────────────────────────────────────
  const totalPendingAssets = overviews
    .reduce((sum, o) => sum + o.pendingAssets, 0n)
    .toString()
  const totalClaimableAssets = overviews
    .reduce((sum, o) => sum + o.claimableAssets, 0n)
    .toString()
  const totalRedeemShares = overviews
    .reduce((sum, o) => sum + o.redeemShares, 0n)
    .toString()

  // Queue breakdown — only entries where shares > 0 are meaningful
  const redeemActiveCount = allWithdrawals.filter(
    (w) => BigInt(w.shares) > 0n && !w.isFulfilled,
  ).length
  const redeemFulfilledCount = allWithdrawals.filter(
    (w) => BigInt(w.shares) > 0n && w.isFulfilled,
  ).length

  return {
    vaults,
    navSnapshot: {
      totalSupply: nav.totalSupply.toString(),
      navDenomination: nav.navDenomination.toString(),
      effNavDenomination: nav.effNavDenomination.toString(),
      globalRedeemShares: nav.globalRedeemShares.toString(),
      assetTotalNavs: nav.assetTotalNavs.map((n) => n.toString()),
      ppsValue: nav.ppsValue.toString(),
      isValidPps: nav.isValidPps,
    },
    redeemQueueLength: Number(queueLen),
    redeemMode: Number(redeemMode),
    pricePerShare: pps.toString(),
    totalPendingAssets,
    totalClaimableAssets,
    totalRedeemShares,
    pausedVaultCount: vaults.filter((v) => v.isPaused).length,
    redeemActiveCount,
    redeemFulfilledCount,
    fetchedAt: Date.now(),
  }
}
