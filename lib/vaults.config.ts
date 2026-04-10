import type { VaultGroupConfig } from './vault-group-config'

export const VAULT_GROUPS: VaultGroupConfig[] = [
  {
    slug: 'main',
    name: 'Main Vault',
    description: 'Primary Harmonix vault on HyperEVM',
    chainId: 999,
    haVaultReaderAddress: '0x3a0B0E25BecEfcda10Ac367f4F3dc33060436f52',
    safe: {
      default: '0xcA42729a96EDA294f70Df05A47903aE0Af35F309',
      operator: '0xcA42729a96EDA294f70Df05A47903aE0Af35F309',
      curator: '0xdC8A772377Ef55CFa04D178A47B6AaD07beC3F4c',
      priceUpdater: '0xb4Fb940F1bdD1Ac82F20b7eaDfa37a336C762d40',
      admin: '0xBb41072c1df45e623901C896816BF867d00E9637',
      timelockProposer: '0xfBb13b8b20375c4F95900A8C3d1fB72685Cf0c9F',
    },
  },
  // Add new vault groups here:
  // {
  //   slug: 'btc-vault',
  //   name: 'BTC Vault',
  //   ...
  // },
]

/** The default vault group (first in the list) */
export const DEFAULT_VAULT_SLUG = VAULT_GROUPS[0].slug

/** Look up a vault group by slug. Returns undefined if not found. */
export function getVaultGroup(slug: string): VaultGroupConfig | undefined {
  return VAULT_GROUPS.find((v) => v.slug === slug)
}

/** Look up a vault group by slug, falling back to the default. */
export function getVaultGroupOrDefault(slug: string | null | undefined): VaultGroupConfig {
  if (slug) {
    const found = getVaultGroup(slug)
    if (found) return found
  }
  return VAULT_GROUPS[0]
}
