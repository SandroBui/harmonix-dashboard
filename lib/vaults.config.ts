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
    haVaultReaderAddress: '0x496D50AC1b149e0af4116aB021153c2a646F2f40',
    safe: {
      default: '0x3Aa399A1863751dD1CdB44Df2E3324d3003b6D27',
    },
    version: 2,
    fundContractAddress: '0x2cA5cF8EF7B35c2c7dF4D7C204A58c6F16d77291',
    underlyingAssetAddress: '0xA47f8e1520b0a7D7474734e5c7e405114baB518d',
    balanceContractAddress: '0x8bf477eAAb88E083c1c7B1A6791fC73EDec2d4EB',
    perpNavContractAddress: '0x15D21B1C017fC5101907f430e9BD925AcdB176B2',
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
