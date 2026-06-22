import { HA_VAULT_READER_V2_ABI } from './contracts'
import { getPublicClient } from './client'
import { getNavPageData } from './nav-reader'
import {
  getBalanceContractAddress,
  getFundContractAddress,
  getPerpNavContractAddress,
  getTimelockControllerAddress,
} from './nav-contract-targets'
import type { VaultGroupConfig } from './vault-group-config'

export type VaultConfigV2Data = {
  addresses: {
    fundContract: string
    fundContractReader: string
    balanceContract: string
    fundNavContract: string
    timelock: string
  }
  vaultConfig: {
    minimumSupply: string
    capacity: string
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
  const publicClient = getPublicClient()
  const vaultSetting = await publicClient.readContract({
    address: config.haVaultReaderAddress,
    abi: HA_VAULT_READER_V2_ABI,
    functionName: 'getVaultSetting',
    args: [fundContractAddress],
  })

  return {
    addresses: {
      fundContract: fundContractAddress.toLowerCase(),
      fundContractReader: config.haVaultReaderAddress.toLowerCase(),
      balanceContract: getBalanceContractAddress(config).toLowerCase(),
      fundNavContract: perpNavAddress.toLowerCase(),
      timelock: getTimelockControllerAddress(config).toLowerCase(),
    },
    vaultConfig: {
      minimumSupply: vaultSetting.minimumSupply.toString(),
      capacity: vaultSetting.capacity.toString(),
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
