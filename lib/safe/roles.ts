import { keccak256, toHex } from 'viem'

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

/** Returns the default Safe address (fallback for all roles). */
export function getDefaultSafeAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_SAFE_ADDRESS
  if (!addr) return '0x' as `0x${string}`
  return addr as `0x${string}`
}

// Static access is required for Next.js to inline NEXT_PUBLIC_* vars at build time.
// Dynamic bracket notation (process.env[variable]) returns undefined in the browser.
const SAFE_ADDRESSES: Record<RoleType, string | undefined> = {
  operator:      process.env.NEXT_PUBLIC_SAFE_OPERATOR,
  curator:       process.env.NEXT_PUBLIC_SAFE_CURATOR,
  price_updater: process.env.NEXT_PUBLIC_SAFE_PRICE_UPDATER,
  timelock_proposer: process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS,
  admin:         process.env.NEXT_PUBLIC_SAFE_ADMIN,
}

/** Returns the Safe address for a given role, falling back to NEXT_PUBLIC_SAFE_ADDRESS. */
export function getSafeAddressForRole(role: RoleType): `0x${string}` {
  const addr = SAFE_ADDRESSES[role]
  if (addr) return addr as `0x${string}`
  return getDefaultSafeAddress()
}
