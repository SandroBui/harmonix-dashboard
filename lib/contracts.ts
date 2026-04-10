import { VAULT_GROUPS } from './vaults.config'

const defaultGroup = VAULT_GROUPS[0]

/** @deprecated Use config.haVaultReaderAddress from VaultGroupConfig instead */
export const HA_VAULT_READER_ADDRESS = defaultGroup.haVaultReaderAddress

export { HA_VAULT_READER_ABI, VAULT_ASSET_ABI, FUND_NAV_FEED_ABI, VAULT_MANAGER_ABI, FUND_VAULT_ABI, STRATEGY_ABI, HA_BASE_ABI, VAULT_MANAGER_ADMIN_ABI } from './abis'
