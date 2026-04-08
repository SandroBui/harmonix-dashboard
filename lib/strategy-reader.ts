import { createPublicClient, http } from 'viem'
import { HA_VAULT_READER_ADDRESS, HA_VAULT_READER_ABI, ASSET_METADATA, STRATEGY_ABI } from './contracts'
import { hyperEvmMainnet } from './wagmi-config'

const publicClient = createPublicClient({
  chain: hyperEvmMainnet,
  transport: http(),
})

// ─── Serialisable output types (no bigints) ───────────────────────────────────

export type StrategyData = {
  address: string
  asset: string
  description: string
  totalAssets: string
  cap: string
  totalAllocated: string
  totalDeallocated: string
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

// ─── Typed readContract helper ────────────────────────────────────────────────

function read(functionName: string, args?: unknown[]) {
  return publicClient.readContract({
    address: HA_VAULT_READER_ADDRESS,
    abi: HA_VAULT_READER_ABI,
    functionName: functionName as never,
    ...(args ? { args: args as never } : {}),
  })
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function getStrategyPageData(): Promise<StrategyPageData> {
  // ── Batch 1: global state ────────────────────────────────────────────────
  const [assets, fundVaultAddress] = await Promise.all([
    read('getRegisteredAssets') as Promise<readonly `0x${string}`[]>,
    read('getFundVault') as Promise<`0x${string}`>,
  ])

  if (assets.length === 0) {
    return { fundVaultAddress: fundVaultAddress.toLowerCase(), assets: [], fetchedAt: Date.now() }
  }

  // ── Batch 2: per-asset data ──────────────────────────────────────────────
  const [strategyLists, idleAmounts, totalManagedAmounts] = await Promise.all([
    Promise.all(assets.map((asset) => read('getStrategies', [asset]) as Promise<readonly `0x${string}`[]>)),
    Promise.all(assets.map((asset) => read('getIdleAssets', [asset]) as Promise<bigint>)),
    Promise.all(assets.map((asset) => read('getTotalManagedAssets', [asset]) as Promise<bigint>)),
  ])

  // ── Batch 3: per-strategy data ───────────────────────────────────────────
  const allStrategies = (strategyLists as `0x${string}`[][]).flat()

  const [allocations, caps, totalAllocated, totalDeallocated, descriptions] = allStrategies.length > 0
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
      ])
    : [[], [], [], [], []]

  // ── Assemble per-asset data ──────────────────────────────────────────────
  let globalIdx = 0

  const assetSummaries: AssetStrategySummary[] = assets.map((asset, i) => {
    const assetAddr = asset.toLowerCase()
    const meta = ASSET_METADATA[assetAddr] ?? { symbol: assetAddr.slice(0, 10), decimals: 18 }
    const idle = idleAmounts[i] ?? 0n
    const totalManaged = totalManagedAmounts[i] ?? 0n
    const deployed = totalManaged > idle ? totalManaged - idle : 0n

    const assetStrategies = (strategyLists[i] ?? []) as `0x${string}`[]
    const strategies: StrategyData[] = assetStrategies.map((addr) => {
      const idx = globalIdx++
      return {
        address: addr.toLowerCase(),
        asset: assetAddr,
        description: descriptions[idx] ?? '',
        totalAssets: (allocations[idx] ?? 0n).toString(),
        cap: (caps[idx] ?? 0n).toString(),
        totalAllocated: (totalAllocated[idx] ?? 0n).toString(),
        totalDeallocated: (totalDeallocated[idx] ?? 0n).toString(),
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
