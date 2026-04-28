import {
  HA_VAULT_READER_ABI,
  FUND_NAV_FEED_ABI,
  VAULT_MANAGER_ABI,
} from './contracts'
import { TIMELOCKED_FUNCTIONS } from './timelocks-reader'
import type { PendingOperation } from './timelocks-reader'
import { getPublicClient } from './client'
import { fetchAssetMetadataForAddresses } from './asset-metadata'
import type { VaultGroupConfig } from './vault-group-config'

export type FeeConfig = {
  feeReceiver: string
  managementFeeRate: string   // WAD (1e18 = 100%)
  performanceFeeRate: string  // WAD
  highWatermark: string       // WAD
  lastManagementHarvest: string   // unix timestamp
  lastHarvestPerformanceFeeTime: string // unix timestamp
}

export type VaultCapEntry = {
  vault: string     // AssetVault address
  asset: string     // underlying asset token address
  symbol: string    // asset ERC-20 symbol
  decimals: number  // asset ERC-20 decimals
  cap: string       // raw asset units (0 means uncapped)
}

export type VaultConfigData = {
  vaultManagerAddress: string
  vaultManagerAdminAddress: string
  accessManager: string
  shareToken: string
  fundVaultAddress: string
  requestManager: string
  priceFeed: string
  fundNav: string
  feeConfig: FeeConfig
  deviationPps: string   // WAD
  maxNavStaleness: string // seconds
  vaultCaps: VaultCapEntry[] // per-AssetVault deposit caps
  timelockDurations: Record<string, string> // fnName → seconds as string
  pendingOps: PendingOperation[]
  fetchedAt: number
}

export async function getVaultConfigData(config: VaultGroupConfig): Promise<VaultConfigData> {
  const publicClient = getPublicClient()
  const { haVaultReaderAddress } = config

  // ── Step 1: get FundNavFeed from reader, then VaultManager from FundNavFeed ─
  const fundNavFeedAddress = await publicClient.readContract({
    address: haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getFundNav',
  }) as `0x${string}`

  const vaultManagerAddress = await publicClient.readContract({
    address: fundNavFeedAddress,
    abi: FUND_NAV_FEED_ABI,
    functionName: 'vaultManager',
  }) as `0x${string}`

  const vaultManagerAdminAddress = await publicClient.readContract({
    address: vaultManagerAddress,
    abi: VAULT_MANAGER_ABI,
    functionName: 'adminFacet',
  }) as `0x${string}`

  // ── Step 2: read all config values in parallel ────────────────────────────
  const [
    accessManager,
    shareToken,
    fundVaultAddress,
    requestManager,
    priceFeed,
    fundNav,
    feeConfigRaw,
    deviationPps,
    maxNavStaleness,
    registeredAssets,
  ] = await Promise.all([
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getAccessManager',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getShareToken',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getFundVault',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getRequestManager',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getPriceFeed',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getFundNav',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getFeeConfig',
    }) as Promise<readonly [`0x${string}`, bigint, bigint, bigint, bigint, bigint]>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getDeviationPps',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getMaxNavStaleness',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getRegisteredAssets',
    }) as Promise<readonly `0x${string}`[]>,
  ])

  // ── Step 2b: per-asset vault address + cap, plus ERC-20 metadata ──────────
  // The cap is keyed by AssetVault address, so we must resolve the vault for
  // each asset first, then read the cap for each vault.
  const assetList = [...registeredAssets]
  const [vaultAddresses, assetMetadata] = assetList.length > 0
    ? await Promise.all([
        Promise.all(
          assetList.map((asset) =>
            publicClient.readContract({
              address: haVaultReaderAddress,
              abi: HA_VAULT_READER_ABI,
              functionName: 'getVaultForAsset',
              args: [asset],
            }) as Promise<`0x${string}`>
          ),
        ),
        fetchAssetMetadataForAddresses(assetList),
      ])
    : [[] as readonly `0x${string}`[], {} as Record<string, import('./vault-group-config').AssetMeta>]

  const resolvedCaps = assetList.length > 0
    ? await Promise.all(
        vaultAddresses.map((vault) =>
          publicClient.readContract({
            address: haVaultReaderAddress,
            abi: HA_VAULT_READER_ABI,
            functionName: 'getVaultCap',
            args: [vault],
          }) as Promise<bigint>
        ),
      )
    : []

  const vaultCaps = assetList.map((asset, i) => {
    const assetAddr = asset.toLowerCase()
    const meta = assetMetadata[assetAddr] ?? { symbol: assetAddr.slice(0, 10), decimals: 18 }
    return {
      vault: vaultAddresses[i].toLowerCase(),
      asset: assetAddr,
      symbol: meta.symbol,
      decimals: meta.decimals,
      cap: (resolvedCaps[i] ?? 0n).toString(),
    }
  })

  // ── Step 3: read timelock durations for VaultManagerAdmin functions ────────
  const adminFns = TIMELOCKED_FUNCTIONS.filter((f) => f.contract === 'vaultManagerAdmin')

  const durations = await Promise.all(
    adminFns.map((f) =>
      publicClient.readContract({
        address: haVaultReaderAddress,
        abi: HA_VAULT_READER_ABI,
        functionName: 'getTimelockDuration',
        args: [vaultManagerAdminAddress, f.selector as `0x${string}`],
      }) as Promise<bigint>
    )
  )

  const timelockDurations: Record<string, string> = {}
  adminFns.forEach((f, i) => {
    timelockDurations[f.name] = (durations[i] ?? 0n).toString()
  })

  // ── Step 4: fetch pending VaultManagerAdmin operations ────────────────────
  type RawPendingOp = {
    data: `0x${string}`
    selector: `0x${string}`
    executableAt: bigint
    isReady: boolean
  }

  const rawPending = await publicClient.readContract({
    address: haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getContractPending',
    args: [vaultManagerAdminAddress],
  }) as readonly RawPendingOp[]

  const pendingOps: PendingOperation[] = rawPending.map((op, i) => {
    const fnDef = TIMELOCKED_FUNCTIONS.find(
      (f) => f.selector.toLowerCase() === op.selector.toLowerCase()
    )
    return {
      id: `${vaultManagerAdminAddress}-${op.selector}-${i}`,
      fnName: fnDef?.name ?? 'unknown',
      selector: op.selector,
      data: op.data,
      contract: 'vaultManagerAdmin',
      contractAddress: vaultManagerAdminAddress.toLowerCase(),
      executableAt: op.executableAt.toString(),
      isReady: op.isReady,
    }
  })

  return {
    vaultManagerAddress: vaultManagerAddress.toLowerCase(),
    vaultManagerAdminAddress: vaultManagerAdminAddress.toLowerCase(),
    accessManager: accessManager.toLowerCase(),
    shareToken: shareToken.toLowerCase(),
    fundVaultAddress: fundVaultAddress.toLowerCase(),
    requestManager: requestManager.toLowerCase(),
    priceFeed: priceFeed.toLowerCase(),
    fundNav: fundNav.toLowerCase(),
    feeConfig: {
      feeReceiver: feeConfigRaw[0].toLowerCase(),
      managementFeeRate: feeConfigRaw[1].toString(),
      performanceFeeRate: feeConfigRaw[3].toString(),
      highWatermark: feeConfigRaw[4].toString(),
      lastManagementHarvest: feeConfigRaw[2].toString(),
      lastHarvestPerformanceFeeTime: feeConfigRaw[5].toString(),
    },
    deviationPps: deviationPps.toString(),
    maxNavStaleness: maxNavStaleness.toString(),
    vaultCaps,
    timelockDurations,
    pendingOps,
    fetchedAt: Date.now(),
  }
}
