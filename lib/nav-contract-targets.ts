import type { VaultGroupConfig } from './vault-group-config'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function requireV2Address(
  config: VaultGroupConfig,
  address: `0x${string}` | undefined,
  fieldName: string,
): `0x${string}` {
  if (config.version !== 2) {
    throw new Error(`${fieldName} is only used for v2 vaults`)
  }
  if (!address || address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(
      `${fieldName} is not configured for vault "${config.slug}". Set it in VAULT_GROUPS.`,
    )
  }
  return address
}

/** v2: fund contract address for Safe propose targets. v3 returns undefined. */
export function getNavProposeTarget(config: VaultGroupConfig): `0x${string}` | undefined {
  if (config.version !== 2) return undefined
  return requireV2Address(config, config.fundContractAddress, 'fundContractAddress')
}

/** v2: fund contract address for NAV reads and proposes. */
export function getFundContractAddress(config: VaultGroupConfig): `0x${string}` {
  return requireV2Address(config, config.fundContractAddress, 'fundContractAddress')
}

/** v2: underlying asset token address. */
export function getUnderlyingAssetAddress(config: VaultGroupConfig): `0x${string}` {
  return requireV2Address(config, config.underlyingAssetAddress, 'underlyingAssetAddress')
}

/** v2: balance contract for executeAction. */
export function getBalanceContractAddress(config: VaultGroupConfig): `0x${string}` {
  return requireV2Address(config, config.balanceContractAddress, 'balanceContractAddress')
}

/** v2: perp NAV contract — returns undefined if not configured. */
export function getPerpNavContractAddress(config: VaultGroupConfig): `0x${string}` | undefined {
  if (config.version !== 2) return undefined
  const address = config.perpNavContractAddress
  if (!address || address.toLowerCase() === ZERO_ADDRESS) return undefined
  return address
}

/** v2: OpenZeppelin TimelockController for upgrades. */
export function getTimelockControllerAddress(config: VaultGroupConfig): `0x${string}` {
  return requireV2Address(
    config,
    config.timelockControllerAddress,
    'timelockControllerAddress',
  )
}
