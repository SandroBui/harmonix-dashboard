import { keccak256, toHex } from 'viem'
import type { VaultGroupConfig, SafeAddresses } from '@/lib/vault-group-config'

export type RoleType = 'operator' | 'curator' | 'price_updater' | 'timelock_proposer' | 'admin'

/** keccak256 hashes of each role string, matching the on-chain AccessManager. */
export const ROLE_HASHES: Record<RoleType, `0x${string}`> = {
  operator: keccak256(toHex('OPERATOR_ROLE')),
  curator: keccak256(toHex('CURATOR_ROLE')),
  price_updater: keccak256(toHex('PRICE_UPDATER_ROLE')),
  timelock_proposer: keccak256(toHex('TIMELOCK_PROPOSER_ROLE')),
  admin: '0x0000000000000000000000000000000000000000000000000000000000000000', // DEFAULT_ADMIN_ROLE = bytes32(0)
}

export const ROLE_LABELS: Record<RoleType, string> = {
  operator: 'Operator',
  curator: 'Curator',
  price_updater: 'Price Updater',
  timelock_proposer: 'Timelock Proposer',
  admin: 'Admin',
}

// Map RoleType to the SafeAddresses property name
const ROLE_TO_SAFE_KEY: Record<RoleType, keyof SafeAddresses> = {
  operator: 'operator',
  curator: 'curator',
  price_updater: 'priceUpdater',
  timelock_proposer: 'timelockProposer',
  admin: 'admin',
}

/** Returns the default Safe address for a vault group. */
export function getDefaultSafeAddress(config: VaultGroupConfig): `0x${string}` {
  return config.safe.default
}

/** Returns the Safe address for a given role within a vault group, falling back to default. */
export function getSafeAddressForRole(config: VaultGroupConfig, role: RoleType): `0x${string}` {
  const key = ROLE_TO_SAFE_KEY[role]
  const addr = config.safe[key]
  if (addr) return addr as `0x${string}`
  return config.safe.default
}
