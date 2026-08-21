import { getAddress, isAddress } from 'viem'
import type { VaultGroupConfig } from '@/lib/vault-group-config'
import { getDefaultSafeAddress } from './roles'
import type { RoleType } from './roles'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export type V2SafeDropdownOption = {
  label: string
  address: `0x${string}`
}

/** All configured Safe labels for v2 UI dropdowns (no address dedup). */
export function buildV2SafeDropdownOptions(
  config: VaultGroupConfig,
  opts?: { includeTimelockProposer?: boolean },
): V2SafeDropdownOption[] {
  const defaultAddr = getDefaultSafeAddress(config)
  const candidates: { label: string; address?: `0x${string}` }[] = [
    { label: 'Default Safe', address: config.safe.default },
    { label: 'Operator Safe', address: config.safe.operator ?? defaultAddr },
    { label: 'Admin Safe', address: config.safe.admin ?? defaultAddr },
  ]
  if (opts?.includeTimelockProposer) {
    candidates.push({
      label: 'Timelock Proposer Safe',
      address: config.safe.timelockProposer ?? defaultAddr,
    })
  }

  return candidates
    .map(({ label, address }) => ({
      label,
      address: (address ?? defaultAddr) as `0x${string}`,
    }))
    .filter(({ address }) => address.toLowerCase() !== ZERO_ADDRESS)
}

export function resolveV2SafeAddressFromLabel(
  options: ReadonlyArray<{ label: string; address: string }>,
  label: string,
): `0x${string}` | undefined {
  const addr = options.find((o) => o.label === label)?.address
  if (!addr || !isAddress(addr)) return undefined
  return getAddress(addr) as `0x${string}`
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
