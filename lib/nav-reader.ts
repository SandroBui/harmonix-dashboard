import { createPublicClient, http } from 'viem'
import {
  HA_VAULT_READER_ADDRESS,
  HA_VAULT_READER_ABI,
  FUND_NAV_FEED_ADDRESS,
  FUND_NAV_FEED_ABI,
  VAULT_MANAGER_ABI,
  ASSET_METADATA,
} from './contracts'
import { hyperEvmMainnet } from './wagmi-config'

const publicClient = createPublicClient({
  chain: hyperEvmMainnet,
  transport: http(),
})

// ─── Serialisable output types (no bigints) ───────────────────────────────────

export type NavCategoryData = {
  description: string
  isActive: boolean
  nav: string // raw integer string
}

export type AssetNavData = {
  asset: string
  symbol: string
  decimals: number
  // Stored per-asset NAV from last updateNav() call (denomination scale, 1e18)
  storedNav: string
  storedDenomination: string
  // Live off-chain NAV total from FundNavFeed (raw token units)
  offChainNav: string
  // Off-chain NAV converted to denomination (1e18) using stored navAsset/navDenomination ratio
  offChainDenomination: string
  // Claimable and pending assets (denomination scale, 1e18)
  claimableDenomination: string
  pendingDenomination: string
  // Effective NAV = storedDenomination - claimable - pending (denomination scale, 1e18)
  effectiveDenomination: string
  // Individual NAV categories from FundNavFeed
  categories: NavCategoryData[]
}

export type NavPageData = {
  // Addresses
  vaultManagerAddress: string
  fundNavFeedAddress: string
  // Live computed NAV snapshot
  liveNavDenomination: string
  liveEffNavDenomination: string
  livePpsValue: string
  liveIsValidPps: boolean
  // Stored (last updateNav()) values
  storedPps: string
  lastNavUpdated: string // seconds timestamp as string
  // Aggregated vault totals (denomination scale, 1e18)
  totalClaimableNav: string
  totalPendingNav: string
  // Per-asset breakdown
  assets: AssetNavData[]
  fetchedAt: number // Date.now()
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function getNavPageData(): Promise<NavPageData> {
  // ── Step 1: discover VaultManager address from FundNavFeed ────────────────
  const vaultManagerAddress = await publicClient.readContract({
    address: FUND_NAV_FEED_ADDRESS,
    abi: FUND_NAV_FEED_ABI,
    functionName: 'vaultManager',
  }) as `0x${string}`

  // ── Batch 2: global state (all in parallel) ───────────────────────────────
  const [navSnapshot, registeredAssets, storedPps, lastNavUpdatedValue, vaultOverviews] = await Promise.all([
    publicClient.readContract({
      address: HA_VAULT_READER_ADDRESS,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getNavSnapshot',
    }) as Promise<{
      totalSupply: bigint
      navDenomination: bigint
      effNavDenomination: bigint
      globalRedeemShares: bigint
      assetTotalNavs: readonly bigint[]
      ppsValue: bigint
      isValidPps: boolean
    }>,
    publicClient.readContract({
      address: HA_VAULT_READER_ADDRESS,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getRegisteredAssets',
    }) as Promise<readonly `0x${string}`[]>,
    publicClient.readContract({
      address: HA_VAULT_READER_ADDRESS,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getPricePerShare',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'lastNavUpdated',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: HA_VAULT_READER_ADDRESS,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getAllVaultOverviews',
    }) as Promise<readonly {
      vault: `0x${string}`
      asset: `0x${string}`
      redeemShares: bigint
      claimableAssets: bigint
      pendingAssets: bigint
      navAsset: bigint
      navDenomination: bigint
      isPaused: boolean
    }[]>,
  ])

  // ── Batch 3: per-asset data (all in parallel) ─────────────────────────────
  const assetList = [...registeredAssets]

  const [storedNavData, offChainNavs, categoriesPerAsset] = assetList.length > 0
    ? await Promise.all([
        // Stored per-asset navs and denominations from HaVaultReader
        Promise.all(
          assetList.map((asset) =>
            publicClient.readContract({
              address: HA_VAULT_READER_ADDRESS,
              abi: HA_VAULT_READER_ABI,
              functionName: 'getAssetNavAndDenomination',
              args: [asset],
            }) as Promise<readonly [bigint, bigint]>
          ),
        ),
        // Off-chain NAV totals from FundNavFeed (single-asset overload)
        Promise.all(
          assetList.map((asset) =>
            publicClient.readContract({
              address: FUND_NAV_FEED_ADDRESS,
              abi: FUND_NAV_FEED_ABI,
              functionName: 'fundNavValue',
              args: [asset],
            }) as Promise<bigint>
          ),
        ),
        // Categories per asset
        Promise.all(
          assetList.map((asset) =>
            publicClient.readContract({
              address: FUND_NAV_FEED_ADDRESS,
              abi: FUND_NAV_FEED_ABI,
              functionName: 'categories',
              args: [asset],
            }) as Promise<readonly { isActive: boolean; description: string; nav: bigint }[]>
          ),
        ),
      ])
    : [[], [], []]

  // ── Aggregate claimable / pending in denomination units ───────────────────
  // denomination = assets * navDenomination / navAsset  (same formula as FundSummaryCards)
  function assetsToDenomination(assets: bigint, navAsset: bigint, navDenomination: bigint): bigint {
    if (assets === 0n || navAsset === 0n) return 0n
    return (assets * navDenomination) / navAsset
  }
  const totalClaimableNav = vaultOverviews
    .reduce((sum, v) => sum + assetsToDenomination(v.claimableAssets, v.navAsset, v.navDenomination), 0n)
    .toString()
  const totalPendingNav = vaultOverviews
    .reduce((sum, v) => sum + assetsToDenomination(v.pendingAssets, v.navAsset, v.navDenomination), 0n)
    .toString()

  // ── Assemble per-asset data ───────────────────────────────────────────────
  // Build a lookup: asset address (lowercase) → vault overview
  const overviewByAsset = new Map(
    (vaultOverviews as typeof vaultOverviews[number][]).map((v) => [v.asset.toLowerCase(), v])
  )

  const assets: AssetNavData[] = assetList.map((asset, i) => {
    const assetAddr = asset.toLowerCase()
    const meta = ASSET_METADATA[assetAddr] ?? { symbol: assetAddr.slice(0, 10), decimals: 18 }

    const [storedNav, storedDenomination] = ((storedNavData as unknown) as [bigint, bigint][])[i] ?? [0n, 0n]
    const offChainNav = (offChainNavs as bigint[])[i] ?? 0n
    const rawCategories = ((categoriesPerAsset as unknown) as { isActive: boolean; description: string; nav: bigint }[][])[i] ?? []

    // Use vault overview's navAsset / navDenomination as the conversion ratio.
    // Fall back to the stored values if the vault isn't in the overview list.
    const overview = overviewByAsset.get(assetAddr)
    const navAsset = overview?.navAsset ?? storedNav
    const navDenom  = overview?.navDenomination ?? storedDenomination

    const claimable = overview?.claimableAssets ?? 0n
    const pending   = overview?.pendingAssets   ?? 0n

    const claimableDenomination = assetsToDenomination(claimable, navAsset, navDenom)
    const pendingDenomination   = assetsToDenomination(pending,   navAsset, navDenom)
    const offChainDenomination  = assetsToDenomination(offChainNav, navAsset, navDenom)

    // Effective = stored denomination minus claimable and pending (clamped to 0)
    const effectiveRaw = storedDenomination - claimableDenomination - pendingDenomination
    const effectiveDenomination = effectiveRaw > 0n ? effectiveRaw : 0n

    const categories: NavCategoryData[] = rawCategories.map((cat) => ({
      description: cat.description,
      isActive: cat.isActive,
      nav: cat.nav.toString(),
    }))

    return {
      asset: assetAddr,
      symbol: meta.symbol,
      decimals: meta.decimals,
      storedNav: storedNav.toString(),
      storedDenomination: storedDenomination.toString(),
      offChainNav: offChainNav.toString(),
      offChainDenomination: offChainDenomination.toString(),
      claimableDenomination: claimableDenomination.toString(),
      pendingDenomination: pendingDenomination.toString(),
      effectiveDenomination: effectiveDenomination.toString(),
      categories,
    }
  })

  return {
    vaultManagerAddress: vaultManagerAddress.toLowerCase(),
    fundNavFeedAddress: FUND_NAV_FEED_ADDRESS.toLowerCase(),
    liveNavDenomination: navSnapshot.navDenomination.toString(),
    liveEffNavDenomination: navSnapshot.effNavDenomination.toString(),
    livePpsValue: navSnapshot.ppsValue.toString(),
    liveIsValidPps: navSnapshot.isValidPps,
    storedPps: storedPps.toString(),
    lastNavUpdated: lastNavUpdatedValue.toString(),
    totalClaimableNav,
    totalPendingNav,
    assets,
    fetchedAt: Date.now(),
  }
}
