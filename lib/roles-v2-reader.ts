import {
  getBalanceContractAddress,
  getFundContractAddress,
  getPerpNavContractAddress,
} from './nav-contract-targets'
import { readProxyAdminOwner, resolveProxyAdminForTarget } from './proxy-admin'
import { buildV2SafeDropdownOptions } from './safe/v2-safes'
import {
  getFundAdminManagerAddress,
  getFundContractReaderAddress,
} from './vault-contract-reader'
import type { VaultGroupConfig } from './vault-group-config'

export type RolesV2ContractKey = 'fund' | 'balance' | 'perpNav' | 'fundContractReader' | 'fundAdminManager'

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

export async function buildProxyAdminEntries(
  config: VaultGroupConfig,
): Promise<RolesV2ProxyAdminEntry[]> {
  const proxyCandidates: { label: string; address: `0x${string}` }[] = [
    { label: 'Balance Contract', address: getBalanceContractAddress(config) },
    { label: 'Fund Contract Reader', address: getFundContractReaderAddress(config) },
    { label: 'Fund Admin Manager', address: getFundAdminManagerAddress(config) },
  ]
  const perpNav = getPerpNavContractAddress(config)
  if (perpNav) {
    proxyCandidates.push({ label: 'Perp NAV Contract', address: perpNav })
  }

  const proxyAdmins: RolesV2ProxyAdminEntry[] = []
  const seenProxies = new Set<string>()
  for (const { label, address } of proxyCandidates) {
    const proxyLower = address.toLowerCase()
    if (seenProxies.has(proxyLower)) continue

    const proxyAdminAddress = await resolveProxyAdminForTarget(address, config)
    if (!proxyAdminAddress) continue

    seenProxies.add(proxyLower)
    const ownerAddress = await readProxyAdminOwner(proxyAdminAddress)
    proxyAdmins.push({
      label,
      proxyAddress: address,
      proxyAdminAddress,
      ownerAddress,
    })
  }

  return proxyAdmins
}

export async function getRolesV2PageData(config: VaultGroupConfig): Promise<RolesV2PageData> {
  const fundContractAddress = getFundContractAddress(config)
  const balanceContractAddress = getBalanceContractAddress(config)
  const perpNavAddress = getPerpNavContractAddress(config)
  const fundContractReaderAddress = getFundContractReaderAddress(config)
  const fundAdminManagerAddress = getFundAdminManagerAddress(config)

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
    {
      key: 'fundContractReader',
      label: 'Fund Contract Reader',
      address: fundContractReaderAddress,
      configured: true,
    },
    {
      key: 'fundAdminManager',
      label: 'Fund Admin Manager',
      address: fundAdminManagerAddress,
      configured: true,
    },
  ]

  const safeEntries = buildV2SafeDropdownOptions(config)

  const proxyAdmins = await buildProxyAdminEntries(config)

  return {
    contracts,
    safes: safeEntries,
    proxyAdmins,
    fetchedAt: Date.now(),
  }
}
