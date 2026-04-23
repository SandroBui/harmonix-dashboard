import type { VaultGroupConfig } from './vault-group-config'

export const VAULT_GROUPS: VaultGroupConfig[] = [
  {
    slug: 'main',
    name: 'Main Vault',
    description: 'Primary Harmonix vault on HyperEVM',
    chainId: 999,
    haVaultReaderAddress: '0x56A796C1cDb02Ed4da713527edf30cE75D5a9E4c',
    safe: {
      default: '0xF0dAE819dB18b4F847306dD2649B39Da819d3DdF',
    },
  },
  {
    slug: 'Old PreProd',
    name: 'Old Preprod',
    description: 'A deprecated main vault',
    chainId: 999,
    haVaultReaderAddress: '0x3a0B0E25BecEfcda10Ac367f4F3dc33060436f52',
    safe: {
      default: '0xcA42729a96EDA294f70Df05A47903aE0Af35F309',
    },
  },
  {
    slug: 'staging',
    name: 'Staging Vault',
    description: 'Staging Harmonix vault on HyperEVM for mock token',
    chainId: 999,
    haVaultReaderAddress: '0x66341e783529c0837Ab16791E031E109d9046fE9',
    safe: {
      default: '0x92493f39dbC498fd7347781eF956d21d4DaCCE75',
    },
  },
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
