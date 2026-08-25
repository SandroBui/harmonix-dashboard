import { FUND_CONTRACT_ABI, HA_VAULT_READER_V2_ABI } from './contracts'
import { getPublicClient } from './client'
import { fetchAssetMetadataForAddresses } from './asset-metadata'
import {
  getFundContractAddress,
  getUnderlyingAssetAddress,
} from './nav-contract-targets'
import type { VaultGroupConfig } from './vault-group-config'
import { hyperEvmMainnet } from './wagmi-config'

export type FundStatusV2Data = {
  chainId: number
  chainName: string
  depositAssetAddress: string
  underlyingSymbol: string
  underlyingDecimals: number
  nav: string
  pricePerShare: string
  withdrawPoolAmount: string
  totalSupply: string
  fetchedAt: number
}

function resolveChainName(chainId: number): string {
  if (chainId === hyperEvmMainnet.id) return hyperEvmMainnet.name
  return `Chain ${chainId}`
}

export async function getFundStatusV2(config: VaultGroupConfig): Promise<FundStatusV2Data> {
  if (config.version !== 2) {
    throw new Error(`getFundStatusV2 is only for v2 vaults (got version ${config.version})`)
  }

  const publicClient = getPublicClient()
  const fundContractAddress = getFundContractAddress(config)
  const underlyingAssetAddress = getUnderlyingAssetAddress(config)
  const { haVaultReaderAddress } = config

  const [vaultState, totalSupply, metadata] = await Promise.all([
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_V2_ABI,
      functionName: 'getVaultState',
      args: [fundContractAddress],
    }),
    publicClient.readContract({
      address: fundContractAddress,
      abi: FUND_CONTRACT_ABI,
      functionName: 'totalSupply',
    }),
    fetchAssetMetadataForAddresses([underlyingAssetAddress]),
  ])

  const underlyingMeta = metadata[underlyingAssetAddress.toLowerCase()]

  return {
    chainId: config.chainId,
    chainName: resolveChainName(config.chainId),
    depositAssetAddress: underlyingAssetAddress.toLowerCase(),
    underlyingSymbol: underlyingMeta?.symbol ?? 'TOKEN',
    underlyingDecimals: underlyingMeta?.decimals ?? 18,
    nav: vaultState.nav.toString(),
    pricePerShare: vaultState.pricePerShare.toString(),
    withdrawPoolAmount: vaultState.withdrawPoolAmount.toString(),
    totalSupply: totalSupply.toString(),
    fetchedAt: Date.now(),
  }
}

/** @deprecated Use getFundStatusV2 */
export const getFundStatusV2Core = getFundStatusV2

/** @deprecated Use FundStatusV2Data */
export type FundStatusV2CoreData = FundStatusV2Data
