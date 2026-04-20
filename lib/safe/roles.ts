import { keccak256, toHex } from 'viem'
import type { VaultGroupConfig, SafeAddresses } from '@/lib/vault-group-config'

export type RoleType =
  | 'operator'
  | 'curator'
  | 'price_updater'
  | 'timelock_proposer'
  | 'admin'
  | 'sentinel'
  | 'upgrade_executor'
  | 'upgrader'

export const DYNAMIC_SAFE_ROLES = [
  'operator',
  'curator',
  'price_updater',
  'timelock_proposer',
  'admin',
] as const

export type DynamicSafeRole = typeof DYNAMIC_SAFE_ROLES[number]

export type ResolvedRoleSafes = Partial<Record<DynamicSafeRole, `0x${string}`>>

/** keccak256 hashes of each role string, matching the on-chain AccessManager. */
export const ROLE_HASHES: Record<RoleType, `0x${string}`> = {
  operator: keccak256(toHex('OPERATOR_ROLE')),
  curator: keccak256(toHex('CURATOR_ROLE')),
  price_updater: keccak256(toHex('PRICE_UPDATER_ROLE')),
  timelock_proposer: keccak256(toHex('TIMELOCK_PROPOSER_ROLE')),
  admin: '0x0000000000000000000000000000000000000000000000000000000000000000', // DEFAULT_ADMIN_ROLE = bytes32(0)
  sentinel: keccak256(toHex('SENTINEL_ROLE')),
  upgrade_executor: keccak256(toHex('UPGRADE_EXECUTOR_ROLE')),
  upgrader: keccak256(toHex('UPGRADER_ROLE')),
}

export const ROLE_LABELS: Record<RoleType, string> = {
  operator: 'Operator',
  curator: 'Curator',
  price_updater: 'Price Updater',
  timelock_proposer: 'Timelock Proposer',
  admin: 'Admin',
  sentinel: 'Sentinel',
  upgrade_executor: 'Upgrade Executor',
  upgrader: 'Upgrader',
}

export const ROLE_DESCRIPTIONS: Record<RoleType, string> = {
  operator: 'Fulfills and cancels withdrawal requests from the redemption queue, and triggers on-chain NAV updates.',
  curator: 'Adds/removes strategies, sets allocation caps, and deploys capital.',
  price_updater: 'Configures oracle and token price feed settings.',
  timelock_proposer: 'Submits time-locked operations on the vault.',
  admin: 'Full administrative control: manages roles, NAV categories, and core configuration.',
  sentinel: 'Monitors the system and can revoke time-locked operations and trigger protective actions when anomalies are detected.',
  upgrade_executor: 'Executes approved contract upgrade proposals after the timelock expires.',
  upgrader: 'Proposes and schedules contract upgrades through the upgrade process.',
}

// Map RoleType to the SafeAddresses property name
const ROLE_TO_SAFE_KEY: Record<RoleType, keyof SafeAddresses> = {
  operator: 'operator',
  curator: 'curator',
  price_updater: 'priceUpdater',
  timelock_proposer: 'timelockProposer',
  admin: 'admin',
  sentinel: 'admin',
  upgrade_executor: 'admin',
  upgrader: 'admin',
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

/** Returns on-chain resolved Safe address when available, otherwise config fallback. */
export function getResolvedSafeAddressForRole(
  config: VaultGroupConfig,
  role: RoleType,
  resolved?: ResolvedRoleSafes,
): `0x${string}` {
  const dynamic = resolved?.[role as DynamicSafeRole]
  if (dynamic) return dynamic
  return getSafeAddressForRole(config, role)
}
