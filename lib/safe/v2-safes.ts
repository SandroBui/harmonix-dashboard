import type { VaultGroupConfig } from '@/lib/vault-group-config'
import { getDefaultSafeAddress, getSafeAddressForRole } from './roles'
import type { RoleType } from './roles'

export type V2SafeEntry = {
  label: string
  role: RoleType
  address: `0x${string}`
}

const V2_SAFE_CANDIDATES: { label: string; role: RoleType }[] = [
  { label: 'Operator Safe', role: 'operator' },
  { label: 'Admin Safe', role: 'admin' },
  { label: 'Timelock Proposer Safe', role: 'timelock_proposer' },
  { label: 'Default Safe', role: 'operator' },
]

/** Unique configured Safe addresses for v2 vaults (deduped by address). */
export function getV2SafeEntries(config: VaultGroupConfig): V2SafeEntry[] {
  const seen = new Set<string>()
  const out: V2SafeEntry[] = []

  for (const { label, role } of V2_SAFE_CANDIDATES) {
    const address =
      role === 'operator' && label === 'Default Safe'
        ? getDefaultSafeAddress(config)
        : getSafeAddressForRole(config, role)

    const lower = address.toLowerCase()
    if (seen.has(lower) || lower === '0x0000000000000000000000000000000000000000') continue
    seen.add(lower)
    out.push({ label, role, address })
  }

  return out
}

export function inferV2RoleFromMethod(method: string | undefined): RoleType | null {
  switch (method) {
    case 'executeAction':
      return 'operator'
    case 'updateNav':
    case 'harvestManagementFee':
    case 'harvestPerformanceFee':
      return 'admin'
    case 'syncPerpDexBalance':
      return 'admin'
    case 'grantRole':
    case 'revokeRole':
      return 'admin'
    case 'schedule':
      return 'timelock_proposer'
    case 'execute':
      return 'upgrade_executor'
    case 'cancel':
      return 'sentinel'
    default:
      return null
  }
}
