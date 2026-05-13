import type { VaultGroupConfig } from './vault-group-config'

export const VAULT_GROUPS: VaultGroupConfig[] = [
  {
    slug: 'main',
    name: 'Main Vault',
    description: 'Primary Harmonix vault on HyperEVM',
    chainId: 999,
    haVaultReaderAddress: '0x6402EB27609eef6FE243fAB5909518C55cb8B644',
    safe: {
      default: '0xF0dAE819dB18b4F847306dD2649B39Da819d3DdF',
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
