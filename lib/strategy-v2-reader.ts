import { fetchAssetMetadataForAddresses } from './asset-metadata'
import {
  getBalanceContractAddress,
  getFundContractAddress,
  getUnderlyingAssetAddress,
} from './nav-contract-targets'
import type { VaultGroupConfig } from './vault-group-config'

export type StrategyV2PageData = {
  balanceContractAddress: string
  fundContractAddress: string
  underlyingAssetAddress: string
  underlyingSymbol: string
  underlyingDecimals: number
  fetchedAt: number
}

export async function getStrategyV2PageData(config: VaultGroupConfig): Promise<StrategyV2PageData> {
  const balanceContractAddress = getBalanceContractAddress(config)
  const fundContractAddress = getFundContractAddress(config)
  const underlyingAssetAddress = getUnderlyingAssetAddress(config)

  const metadata = await fetchAssetMetadataForAddresses([underlyingAssetAddress])
  const underlyingMeta = metadata[underlyingAssetAddress.toLowerCase()]

  return {
    balanceContractAddress,
    fundContractAddress,
    underlyingAssetAddress,
    underlyingSymbol: underlyingMeta?.symbol ?? underlyingAssetAddress.slice(0, 10),
    underlyingDecimals: underlyingMeta?.decimals ?? 18,
    fetchedAt: Date.now(),
  }
}
