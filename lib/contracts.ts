export const HA_VAULT_READER_ADDRESS =
  '0x3a0B0E25BecEfcda10Ac367f4F3dc33060436f52' as const

export const FUND_NAV_FEED_ADDRESS =
  '0x26493d5D3121a7938f8835436d777B6D10d67077' as const

/** Known asset token metadata keyed by lowercase address. */
export const ASSET_METADATA: Record<string, { symbol: string; decimals: number }> = {
  '0xb88339cb7199b77e23db6e890353e22632ba630f': { symbol: 'USDC', decimals: 6 },
  '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34': { symbol: 'USDe', decimals: 18 },
}

export { HA_VAULT_READER_ABI, VAULT_ASSET_ABI, FUND_NAV_FEED_ABI, VAULT_MANAGER_ABI, FUND_VAULT_ABI, STRATEGY_ABI, HA_BASE_ABI, VAULT_MANAGER_ADMIN_ABI } from './abis';