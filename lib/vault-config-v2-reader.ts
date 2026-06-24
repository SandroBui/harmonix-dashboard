import { getPublicClient } from './client'
import { getNavPageData } from './nav-reader'
import {
  getBalanceContractAddress,
  getFundAdminManagerAddress,
  getFundContractAddress,
  getPerpNavContractAddress,
  getTimelockControllerAddress,
} from './nav-contract-targets'
import { readVaultSettingV2 } from './vault-setting-v2'
import type { VaultGroupConfig } from './vault-group-config'

export type VaultConfigV2Data = {
  addresses: {
    fundContract: string
    fundContractReader: string
    balanceContract: string
    fundNavContract: string
    fundAdminManager: string
    timelock: string
  }
  vaultConfig: {
    minimumSupply: string
    capacity: string
    ppsDeviationBps: string
    maxNavStaleness: string
    networkCost: string
  }
  fees: {
    managementFeeRate: string
    performanceFeeRate: string
    managementFeeReceiver: string
    performanceFeeReceiver: string
    highWatermark: string
    lastManagementHarvest: string
    lastPerformanceHarvest: string
    managementFeePreview: { feeAmount: string; sharesToMint: string }
    performanceFeePreview: { feeAmount: string; sharesToMint: string }
  }
  fetchedAt: number
}

export async function getVaultConfigV2Data(config: VaultGroupConfig): Promise<VaultConfigV2Data> {
  if (config.version !== 2) {
    throw new Error(`getVaultConfigV2Data is only for v2 vaults (got version ${config.version})`)
  }

  const perpNavAddress = getPerpNavContractAddress(config)
  if (!perpNavAddress) {
    throw new Error(
      `perpNavContractAddress is not configured for vault "${config.slug}". Set it in VAULT_GROUPS.`,
    )
  }

  const navData = await getNavPageData(config)

  const fundContractAddress = getFundContractAddress(config)
  const fundAdminManagerAddress = getFundAdminManagerAddress(config)
  const publicClient = getPublicClient()
  const vaultSetting = await readVaultSettingV2(
    publicClient,
    config.haVaultReaderAddress,
    fundContractAddress,
  )

  return {
    addresses: {
      fundContract: fundContractAddress.toLowerCase(),
      fundContractReader: config.haVaultReaderAddress.toLowerCase(),
      balanceContract: getBalanceContractAddress(config).toLowerCase(),
      fundNavContract: perpNavAddress.toLowerCase(),
      fundAdminManager: fundAdminManagerAddress.toLowerCase(),
      timelock: getTimelockControllerAddress(config).toLowerCase(),
    },
    vaultConfig: {
      minimumSupply: vaultSetting.minimumSupply.toString(),
      capacity: vaultSetting.capacity.toString(),
      ppsDeviationBps: vaultSetting.ppsDeviationBps.toString(),
      maxNavStaleness: vaultSetting.maxNavStaleness.toString(),
      networkCost: vaultSetting.networkCost.toString(),
    },
    fees: {
      managementFeeRate: navData.managementFeeRate,
      performanceFeeRate: navData.performanceFeeRate,
      managementFeeReceiver: navData.managementFeeReceiver ?? navData.feeReceiver,
      performanceFeeReceiver: navData.performanceFeeReceiver ?? navData.feeReceiver,
      highWatermark: navData.highWatermark,
      lastManagementHarvest: navData.lastManagementHarvest,
      lastPerformanceHarvest: navData.lastPerformanceHarvest,
      managementFeePreview: navData.managementFeePreview,
      performanceFeePreview: navData.performanceFeePreview,
    },
    fetchedAt: navData.fetchedAt,
  }
}
