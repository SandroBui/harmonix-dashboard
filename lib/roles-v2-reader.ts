import {
  getBalanceContractAddress,
  getFundContractAddress,
  getPerpNavContractAddress,
} from './nav-contract-targets'
import { readProxyAdminAddress, readProxyAdminOwner } from './proxy-admin'
import { getDefaultSafeAddress } from './safe/roles'
import type { VaultGroupConfig } from './vault-group-config'

export type RolesV2ContractKey = 'fund' | 'balance' | 'perpNav'

export type RolesV2ContractOption = {
  key: RolesV2ContractKey
  label: string
  address: string
  configured: boolean
}

export type RolesV2SafeOption = {
  label: string
  address: string
}

export type RolesV2ProxyAdminEntry = {
  label: string
  proxyAddress: string
  proxyAdminAddress: string
  ownerAddress: string
}

export type RolesV2PageData = {
  contracts: RolesV2ContractOption[]
  safes: RolesV2SafeOption[]
  proxyAdmins: RolesV2ProxyAdminEntry[]
  fetchedAt: number
}

export async function getRolesV2PageData(config: VaultGroupConfig): Promise<RolesV2PageData> {
  const fundContractAddress = getFundContractAddress(config)
  const balanceContractAddress = getBalanceContractAddress(config)
  const perpNavAddress = getPerpNavContractAddress(config)

  const contracts: RolesV2ContractOption[] = [
    {
      key: 'fund',
      label: 'Fund Contract',
      address: fundContractAddress,
      configured: true,
    },
    {
      key: 'balance',
      label: 'Balance Contract',
      address: balanceContractAddress,
      configured: true,
    },
    {
      key: 'perpNav',
      label: 'Perp NAV Contract',
      address: perpNavAddress ?? '0x0000000000000000000000000000000000000000',
      configured: Boolean(perpNavAddress),
    },
  ]

  const safeEntries: RolesV2SafeOption[] = []
  const seen = new Set<string>()
  const candidates: { label: string; address?: `0x${string}` }[] = [
    { label: 'Default Safe', address: config.safe.default },
    { label: 'Operator Safe', address: config.safe.operator },
    { label: 'Admin Safe', address: config.safe.admin },
  ]
  for (const { label, address } of candidates) {
    const resolved = address ?? getDefaultSafeAddress(config)
    const lower = resolved.toLowerCase()
    if (seen.has(lower) || lower === '0x0000000000000000000000000000000000000000') continue
    seen.add(lower)
    safeEntries.push({ label, address: resolved })
  }

  const proxyCandidates: { label: string; address: `0x${string}` }[] = [
    { label: 'Balance Contract', address: getBalanceContractAddress(config) },
  ]
  const perpNav = getPerpNavContractAddress(config)
  if (perpNav) {
    proxyCandidates.push({ label: 'Perp NAV Contract', address: perpNav })
  }

  const proxyAdmins: RolesV2ProxyAdminEntry[] = []
  const seenAdmins = new Set<string>()
  for (const { label, address } of proxyCandidates) {
    const proxyAdminAddress = await readProxyAdminAddress(address)
    if (!proxyAdminAddress) continue
    const adminLower = proxyAdminAddress.toLowerCase()
    if (seenAdmins.has(adminLower)) continue
    seenAdmins.add(adminLower)
    const ownerAddress = await readProxyAdminOwner(proxyAdminAddress)
    proxyAdmins.push({
      label,
      proxyAddress: address,
      proxyAdminAddress,
      ownerAddress,
    })
  }

  return {
    contracts,
    safes: safeEntries,
    proxyAdmins,
    fetchedAt: Date.now(),
  }
}
