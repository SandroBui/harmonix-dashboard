import type { VaultGroupConfig } from './vault-group-config'

export const VAULT_GROUPS: VaultGroupConfig[] = [
  {
    slug: 'hip-3-hausdc-vault',
    name: 'Hip-3 haUSDC Vault',
    description: 'Harmonix haUSDC vault on HyperEVM',
    chainId: 999,
    haVaultReaderAddress: '0x6402EB27609eef6FE243fAB5909518C55cb8B644',
    safe: {
      default: '0x239499551fb5C0Ed8306C8897F9ed428dF2d055a',
    },
    version: 3,
  },
  {
    slug: 'hype-hahype-vault',
    name: 'HyperEVM $HYPE Vault',
    description: 'Harmonix haHype vault on HyperEVM',
    chainId: 999,
    haVaultReaderAddress: '0xEeC3EfA754CF7e41B2952068Ab4aCE37BC30799e',
    safe: {
      default: '0x3Aa399A1863751dD1CdB44Df2E3324d3003b6D27',
    },
    version: 2,
    fundContractAddress: '0xeebBf3Ae4b2aA91810cF16d98b6aA225FE9745EE',
    underlyingAssetAddress: '0x5555555555555555555555555555555555555555',
    balanceContractAddress: '0x39A7d3DfF6D2E31B4A11CA8C8969b619fE6e99DA',
    perpNavContractAddress: '0xe695af78Bf21Adf23f85720C666fca6552a9445F',
    timelockControllerAddress: '0x8290eF21817924C2b7790886D81c766515a8bc82',
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
  return getVaultGroup(DEFAULT_VAULT_SLUG) ?? VAULT_GROUPS[0]
}
