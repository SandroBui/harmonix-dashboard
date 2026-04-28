import {
  HA_VAULT_READER_ABI,
  FUND_NAV_FEED_ABI,
  VAULT_MANAGER_ABI,
} from './contracts'
import { getPublicClient } from './client'
import { fetchAssetMetadataForAddresses } from './asset-metadata'
import type { VaultGroupConfig } from './vault-group-config'

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
  // AssetVault address (one per registered asset)
  vaultAddress: string
  // Per-vault deposit cap in asset units. "0" means uncapped.
  vaultCap: string
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
  // Fee context (from VaultManager)
  managementFeeRate: string // WAD scale (1e18 = 100%/year)
  performanceFeeRate: string // WAD scale (1e18 = 100%)
  lastManagementHarvest: string // seconds timestamp as string ("0" = never)
  lastPerformanceHarvest: string // seconds timestamp as string ("0" = never)
  highWatermark: string // PPS scale (1e18) — "0" means uninitialized
  feeReceiver: string // 0x... address
  // Harvest previews (from HaVaultReader.previewHarvest*Fee)
  managementFeePreview: { feeAmount: string; sharesToMint: string }
  performanceFeePreview: { feeAmount: string; sharesToMint: string }
  // Aggregated vault totals (denomination scale, 1e18)
  totalClaimableNav: string
  totalPendingNav: string
  // Per-asset breakdown
  assets: AssetNavData[]
  fetchedAt: number // Date.now()
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function getNavPageData(config: VaultGroupConfig): Promise<NavPageData> {
  const publicClient = getPublicClient()
  const { haVaultReaderAddress } = config

  // ── Step 1: get FundNavFeed address from HaVaultReader ───────────────────
  const fundNavFeedAddress = await publicClient.readContract({
    address: haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getFundNav',
  }) as `0x${string}`

  // ── Step 2: discover VaultManager address from FundNavFeed ────────────────
  const vaultManagerAddress = await publicClient.readContract({
    address: fundNavFeedAddress,
    abi: FUND_NAV_FEED_ABI,
    functionName: 'vaultManager',
  }) as `0x${string}`

  // ── Batch 3: global state (all in parallel) ───────────────────────────────
  const [
    navSnapshot,
    registeredAssets,
    storedPps,
    lastNavUpdatedValue,
    vaultOverviews,
    managementFeeRateValue,
    performanceFeeRateValue,
    lastManagementHarvestValue,
    lastPerformanceHarvestValue,
    highWatermarkValue,
    feeReceiverValue,
    managementFeePreviewTuple,
    performanceFeePreviewTuple,
  ] = await Promise.all([
    publicClient.readContract({
      address: haVaultReaderAddress,
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
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getRegisteredAssets',
    }) as Promise<readonly `0x${string}`[]>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getPricePerShare',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'lastNavUpdated',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: haVaultReaderAddress,
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
    publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'managementFeeRate',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'performanceFeeRate',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'lastManagementHarvest',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'lastHarvestPerformanceFeeTime',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'highWatermark',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'feeReceiver',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'previewHarvestManagementFee',
    }) as Promise<readonly [bigint, bigint]>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'previewHarvestPerformanceFee',
    }) as Promise<readonly [bigint, bigint]>,
  ])

  // ── Batch 4: per-asset data (all in parallel) ─────────────────────────────
  const assetList = [...registeredAssets]

  // Vault address per asset, taken from the already-fetched overviews. This
  // avoids an extra round-trip for vaultForAsset().
  const vaultByAsset = new Map(
    (vaultOverviews as typeof vaultOverviews[number][]).map((v) => [v.asset.toLowerCase(), v.vault.toLowerCase()])
  )

  const [storedNavData, offChainNavs, categoriesPerAsset, assetMetadata, vaultCaps] = assetList.length > 0
    ? await Promise.all([
        // Stored per-asset navs and denominations from HaVaultReader
        Promise.all(
          assetList.map((asset) =>
            publicClient.readContract({
              address: haVaultReaderAddress,
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
              address: fundNavFeedAddress,
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
              address: fundNavFeedAddress,
              abi: FUND_NAV_FEED_ABI,
              functionName: 'categories',
              args: [asset],
            }) as Promise<readonly { isActive: boolean; description: string; nav: bigint }[]>
          ),
        ),
        // ERC-20 symbol + decimals for each asset
        fetchAssetMetadataForAddresses(assetList),
        // Per-AssetVault deposit cap (raw asset units; 0 means uncapped)
        Promise.all(
          assetList.map((asset) => {
            const vault = vaultByAsset.get(asset.toLowerCase())
            if (!vault) return Promise.resolve(0n)
            return publicClient.readContract({
              address: haVaultReaderAddress,
              abi: HA_VAULT_READER_ABI,
              functionName: 'getVaultCap',
              args: [vault as `0x${string}`],
            }) as Promise<bigint>
          }),
        ),
      ])
    : [[], [], [], {} as Record<string, import('./vault-group-config').AssetMeta>, []]

  // ── Aggregate claimable / pending in denomination units ───────────────────
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
  const overviewByAsset = new Map(
    (vaultOverviews as typeof vaultOverviews[number][]).map((v) => [v.asset.toLowerCase(), v])
  )

  const assets: AssetNavData[] = assetList.map((asset, i) => {
    const assetAddr = asset.toLowerCase()
    const meta = assetMetadata[assetAddr] ?? { symbol: assetAddr.slice(0, 10), decimals: 18 }

    const [storedNav, storedDenomination] = ((storedNavData as unknown) as [bigint, bigint][])[i] ?? [0n, 0n]
    const offChainNav = (offChainNavs as bigint[])[i] ?? 0n
    const rawCategories = ((categoriesPerAsset as unknown) as { isActive: boolean; description: string; nav: bigint }[][])[i] ?? []

    const overview = overviewByAsset.get(assetAddr)
    const navAsset = overview?.navAsset ?? storedNav
    const navDenom  = overview?.navDenomination ?? storedDenomination

    const claimable = overview?.claimableAssets ?? 0n
    const pending   = overview?.pendingAssets   ?? 0n

    const claimableDenomination = assetsToDenomination(claimable, navAsset, navDenom)
    const pendingDenomination   = assetsToDenomination(pending,   navAsset, navDenom)
    const offChainDenomination  = assetsToDenomination(offChainNav, navAsset, navDenom)

    const effectiveRaw = storedDenomination - claimableDenomination - pendingDenomination
    const effectiveDenomination = effectiveRaw > 0n ? effectiveRaw : 0n

    const categories: NavCategoryData[] = rawCategories.map((cat) => ({
      description: cat.description,
      isActive: cat.isActive,
      nav: cat.nav.toString(),
    }))

    const cap = (vaultCaps as bigint[])[i] ?? 0n

    return {
      asset: assetAddr,
      symbol: meta.symbol,
      decimals: meta.decimals,
      vaultAddress: (overview?.vault?.toLowerCase() ?? ''),
      vaultCap: cap.toString(),
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
    fundNavFeedAddress: fundNavFeedAddress.toLowerCase(),
    liveNavDenomination: navSnapshot.navDenomination.toString(),
    liveEffNavDenomination: navSnapshot.effNavDenomination.toString(),
    livePpsValue: navSnapshot.ppsValue.toString(),
    liveIsValidPps: navSnapshot.isValidPps,
    storedPps: storedPps.toString(),
    lastNavUpdated: lastNavUpdatedValue.toString(),
    managementFeeRate: managementFeeRateValue.toString(),
    performanceFeeRate: performanceFeeRateValue.toString(),
    lastManagementHarvest: lastManagementHarvestValue.toString(),
    lastPerformanceHarvest: lastPerformanceHarvestValue.toString(),
    highWatermark: highWatermarkValue.toString(),
    feeReceiver: feeReceiverValue.toLowerCase(),
    managementFeePreview: {
      feeAmount: managementFeePreviewTuple[0].toString(),
      sharesToMint: managementFeePreviewTuple[1].toString(),
    },
    performanceFeePreview: {
      feeAmount: performanceFeePreviewTuple[0].toString(),
      sharesToMint: performanceFeePreviewTuple[1].toString(),
    },
    totalClaimableNav,
    totalPendingNav,
    assets,
    fetchedAt: Date.now(),
  }
}
