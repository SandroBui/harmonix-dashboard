import { getAddress, isAddress } from 'viem'
import type { SafeAddresses, VaultGroupConfig } from '@/lib/vault-group-config'
import { ROLE_LABELS } from './roles'
import type { RoleType } from './roles'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export type VaultSafeOption = {
  label: string
  address: `0x${string}`
  /** Role tag applied to this Safe's txs; strategy wallets carry no role. */
  role: RoleType | null
  /** Chain the Safe lives on — role Safes always sit on the vault chain. */
  chainId: number
}

const ROLE_SAFE_FIELDS: {
  key: Exclude<keyof SafeAddresses, 'strategyWallets'>
  label: string
  role: RoleType | null
}[] = [
  { key: 'default', label: 'Default Safe', role: null },
  { key: 'operator', label: `${ROLE_LABELS.operator} Safe`, role: 'operator' },
  { key: 'curator', label: `${ROLE_LABELS.curator} Safe`, role: 'curator' },
  { key: 'admin', label: `${ROLE_LABELS.admin} Safe`, role: 'admin' },
  { key: 'timelockProposer', label: `${ROLE_LABELS.timelock_proposer} Safe`, role: 'timelock_proposer' },
]

/**
 * Every Safe declared on the vault config — role Safes plus strategy wallets.
 * Entries are listed as configured; two labels may point at the same address.
 */
export function getVaultSafeOptions(config: VaultGroupConfig): VaultSafeOption[] {
  const options: VaultSafeOption[] = []

  function add(
    label: string,
    address: string | undefined,
    role: RoleType | null,
    chainId: number,
  ) {
    // Casing is normalized below, so a config entry that isn't checksummed
    // still shows up instead of silently disappearing from the selector.
    if (!address || !isAddress(address, { strict: false })) return
    const normalized = getAddress(address) as `0x${string}`
    if (normalized.toLowerCase() === ZERO_ADDRESS) return
    options.push({ label, address: normalized, role, chainId })
  }

  for (const { key, label, role } of ROLE_SAFE_FIELDS) {
    add(label, config.safe[key], role, config.chainId)
  }
  for (const wallet of config.safe.strategyWallets ?? []) {
    add(wallet.name, wallet.address, null, wallet.chainId ?? config.chainId)
  }

  return options
}
