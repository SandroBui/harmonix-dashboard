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
      strategyWallets: [
        { name: 'HIP3-pendle', address: '0x0e05f0098778373e93f7128928FF25D77085f2cc' },
        { name: 'HIP3-buffer', address: '0xfe26Ea4277275761039643fC53F340710DD52Ae1' },
      ],
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
      operator: '0x3Aa399A1863751dD1CdB44Df2E3324d3003b6D27',
      admin: '0x3Aa399A1863751dD1CdB44Df2E3324d3003b6D27',
      strategyWallets: [
        { name: 'HYPE-main', address: '0xc0Ca1e04FD623a8F165c80e7baD7bcfdC4d81f66' },
        { name: 'HYPE-loop', address: '0xBA8F3A35427a599AB08CeA933a40DA1092fb56Ce' },
        { name: 'HYPE-buffer', address: '0x706dECF1A1220c259aD936C28b9b76D5B603B847' },
        { name: 'HYPE-main', address: '0x177D7A127fDE8C84DbD8Dd9BE07cf9F818520ee0' },
      ],
    },
    version: 2,
    fundContractAddress: '0x2cA5cF8EF7B35c2c7dF4D7C204A58c6F16d77291',
    underlyingAssetAddress: '0xA47f8e1520b0a7D7474734e5c7e405114baB518d',
    balanceContractAddress: '0x8bf477eAAb88E083c1c7B1A6791fC73EDec2d4EB',
    perpNavContractAddress: '0x15D21B1C017fC5101907f430e9BD925AcdB176B2',
    fundAdminManagerContractAddress: '0x65D389daEa19fC9a704b17a81F953d70cEAa5D34',
    timelockControllerAddress: '0x8290eF21817924C2b7790886D81c766515a8bc82',
  },
  {
    slug: 'hype-hakhype-vault',
    name: 'HyperEVM $KHYPE Vault',
    description: 'Harmonix haKHype vault on HyperEVM',
    chainId: 999,
    haVaultReaderAddress: '0x496D50AC1b149e0af4116aB021153c2a646F2f40',
    safe: {
      default: '0x3Aa399A1863751dD1CdB44Df2E3324d3003b6D27',
      operator: '0x3Aa399A1863751dD1CdB44Df2E3324d3003b6D27',
      admin: '0x3Aa399A1863751dD1CdB44Df2E3324d3003b6D27',
      strategyWallets: [
        { name: 'KHYPE-main', address: '0xe9A0b34285Bcf33512931b4Eb8Aad84153F126E5' },
        { name: 'KHYPE-loop', address: '0x177D7A127fDE8C84DbD8Dd9BE07cf9F818520ee0' },
        { name: 'USDC-DN', address: '0x0C623F8BF7c1604Dd67e92910691B8B896F5cdAD' },
      ],
    },
    version: 2,
    fundContractAddress: '0x2cA5cF8EF7B35c2c7dF4D7C204A58c6F16d77291',
    underlyingAssetAddress: '0xA47f8e1520b0a7D7474734e5c7e405114baB518d',
    balanceContractAddress: '0x8bf477eAAb88E083c1c7B1A6791fC73EDec2d4EB',
    perpNavContractAddress: '0x15D21B1C017fC5101907f430e9BD925AcdB176B2',
    fundAdminManagerContractAddress: '0x65D389daEa19fC9a704b17a81F953d70cEAa5D34',
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
