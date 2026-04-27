import { HA_VAULT_READER_ABI, STRATEGY_ABI, HA_PORTFOLIO_MARGIN_ABI } from './contracts'
import { getPublicClient } from './client'
import { fetchAssetMetadataForAddresses } from './asset-metadata'
import type { VaultGroupConfig } from './vault-group-config'

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// ─── Serialisable output types (no bigints) ───────────────────────────────────

export type StrategyData = {
  address: string
  asset: string
  description: string
  totalAssets: string    // getAllocated — FundVault's net accounting (shown as NAV)
  evmBalance: string     // ERC20.balanceOf(strategy) — tokens held on HyperEVM
  cap: string
  totalAllocated: string
  totalDeallocated: string
  // HaPortfolioMargin-only — undefined for other strategy types, or if the call reverts
  spotBalance?: string      // HyperCore spot balance, in EVM decimals
  lendingBalance?: string   // PM lending supply, in EVM decimals
}

export type AssetStrategySummary = {
  asset: string
  symbol: string
  decimals: number
  idleAssets: string
  totalManagedAssets: string
  deployedAssets: string
  strategies: StrategyData[]
}

export type StrategyPageData = {
  fundVaultAddress: string
  assets: AssetStrategySummary[]
  fetchedAt: number
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function getStrategyPageData(config: VaultGroupConfig): Promise<StrategyPageData> {
  const publicClient = getPublicClient()
  const { haVaultReaderAddress } = config

  function read(functionName: string, args?: unknown[]) {
    return publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: functionName as never,
      ...(args ? { args: args as never } : {}),
    })
  }

  // ── Batch 1: global state ────────────────────────────────────────────────
  const [assets, fundVaultAddress] = await Promise.all([
    read('getRegisteredAssets') as Promise<readonly `0x${string}`[]>,
    read('getFundVault') as Promise<`0x${string}`>,
  ])

  if (assets.length === 0) {
    return { fundVaultAddress: fundVaultAddress.toLowerCase(), assets: [], fetchedAt: Date.now() }
  }

  // ── Batch 2: per-asset data ──────────────────────────────────────────────
  const [strategyLists, idleAmounts, totalManagedAmounts, assetMetadata] = await Promise.all([
    Promise.all(assets.map((asset) => read('getStrategies', [asset]) as Promise<readonly `0x${string}`[]>)),
    Promise.all(assets.map((asset) => read('getIdleAssets', [asset]) as Promise<bigint>)),
    Promise.all(assets.map((asset) => read('getTotalManagedAssets', [asset]) as Promise<bigint>)),
    fetchAssetMetadataForAddresses(assets),
  ])

  // ── Batch 3: per-strategy data ───────────────────────────────────────────
  const allStrategies = (strategyLists as `0x${string}`[][]).flat()

  // Pair each strategy address with its asset address for balanceOf calls
  const allStrategyAssets = (strategyLists as `0x${string}`[][]).flatMap((list, i) =>
    list.map(() => assets[i] as `0x${string}`),
  )

  const [allocations, caps, totalAllocated, totalDeallocated, descriptions, evmBalances] = allStrategies.length > 0
    ? await Promise.all([
        Promise.all(allStrategies.map((s) => read('getAllocated', [s]) as Promise<bigint>)),
        Promise.all(allStrategies.map((s) => read('getStrategyCap', [s]) as Promise<bigint>)),
        Promise.all(allStrategies.map((s) => read('getTotalAllocated', [s]) as Promise<bigint>)),
        Promise.all(allStrategies.map((s) => read('getTotalDeallocated', [s]) as Promise<bigint>)),
        Promise.all(allStrategies.map((s) =>
          publicClient.readContract({
            address: s,
            abi: STRATEGY_ABI,
            functionName: 'description',
          }) as Promise<string>
        )),
        Promise.all(allStrategies.map((s, i) =>
          publicClient.readContract({
            address: allStrategyAssets[i],
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [s],
          }) as Promise<bigint>
        )),
      ])
    : [[], [], [], [], [], []]

  // ── Batch 3b: HaPortfolioMargin-specific views ───────────────────────────
  // Conditional on description prefix; matches the deployment convention
  // "HaPortfolioMargin - <ASSET>". A revert (e.g. precompile not initialised)
  // is swallowed and treated the same as "not a HaPortfolioMargin" — the UI
  // simply omits the breakdown row in that case.
  const isHaPortfolioMargin = allStrategies.map((_, i) =>
    (descriptions[i] ?? '').startsWith('HaPortfolioMargin'),
  )

  const [spotBalances, lendingBalances] = allStrategies.length > 0
    ? await Promise.all([
        Promise.all(allStrategies.map((s, i) =>
          isHaPortfolioMargin[i]
            ? (publicClient.readContract({
                address: s,
                abi: HA_PORTFOLIO_MARGIN_ABI,
                functionName: 'spotBalance',
              }) as Promise<bigint>).catch(() => null)
            : Promise.resolve(null),
        )),
        Promise.all(allStrategies.map((s, i) =>
          isHaPortfolioMargin[i]
            ? (publicClient.readContract({
                address: s,
                abi: HA_PORTFOLIO_MARGIN_ABI,
                functionName: 'lendingBalance',
              }) as Promise<bigint>).catch(() => null)
            : Promise.resolve(null),
        )),
      ])
    : [[], []]

  // ── Assemble per-asset data ──────────────────────────────────────────────
  let globalIdx = 0

  const assetSummaries: AssetStrategySummary[] = assets.map((asset, i) => {
    const assetAddr = asset.toLowerCase()
    const meta = assetMetadata[assetAddr] ?? { symbol: assetAddr.slice(0, 10), decimals: 18 }
    const idle = idleAmounts[i] ?? 0n
    const totalManaged = totalManagedAmounts[i] ?? 0n
    const deployed = totalManaged > idle ? totalManaged - idle : 0n

    const assetStrategies = (strategyLists[i] ?? []) as `0x${string}`[]
    const strategies: StrategyData[] = assetStrategies.map((addr) => {
      const idx = globalIdx++
      const spot = spotBalances[idx]
      const lending = lendingBalances[idx]
      return {
        address: addr.toLowerCase(),
        asset: assetAddr,
        description: descriptions[idx] ?? '',
        totalAssets: (allocations[idx] ?? 0n).toString(),
        evmBalance: (evmBalances[idx] ?? 0n).toString(),
        cap: (caps[idx] ?? 0n).toString(),
        totalAllocated: (totalAllocated[idx] ?? 0n).toString(),
        totalDeallocated: (totalDeallocated[idx] ?? 0n).toString(),
        spotBalance: spot !== null && spot !== undefined ? spot.toString() : undefined,
        lendingBalance: lending !== null && lending !== undefined ? lending.toString() : undefined,
      }
    })

    return {
      asset: assetAddr,
      symbol: meta.symbol,
      decimals: meta.decimals,
      idleAssets: idle.toString(),
      totalManagedAssets: totalManaged.toString(),
      deployedAssets: deployed.toString(),
      strategies,
    }
  })

  return {
    fundVaultAddress: fundVaultAddress.toLowerCase(),
    assets: assetSummaries,
    fetchedAt: Date.now(),
  }
}
