import { decodeAbiParameters, encodeFunctionData, getAddress, isAddress } from 'viem'
import { PROXY_ADMIN_ABI } from './abis/proxy-admin'
import { readProxyAdminAddress, readProxyAdminOwner } from './proxy-admin'
import {
  getBalanceContractAddress,
  getFundContractAddress,
  getPerpNavContractAddress,
} from './nav-contract-targets'
import { getFundContractReaderAddress, getFundAdminManagerAddress } from './vault-contract-reader'
import type { VaultGroupConfig } from './vault-group-config'

export type UpgradeMode = 'uups' | 'transparent'

/** How a proxy upgrade is delivered on-chain */
export type UpgradeDelivery = 'timelock' | 'safe-direct'

export type KnownContract = {
  name: string
  address: `0x${string}`
  upgradeMode: UpgradeMode
  proxyAdminAddress?: `0x${string}`
  /** Ownable owner of ProxyAdmin — only set for transparent proxies */
  proxyAdminOwner?: `0x${string}`
}

const TRANSPARENT_SHELL_NAMES = new Set([
  'Balance Contract',
  'Perp NAV Contract',
  'Fund Contract Reader',
  'Fund Admin Manager',
])

/** Transparent proxies that use ProxyAdmin.upgradeAndCall (never UUPS upgradeToAndCall on proxy). */
const PERP_NAV_STYLE_UPGRADE_NAMES = new Set(['Fund Admin Manager'])

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function resolveUpgradeDelivery(
  entry: Pick<KnownContract, 'upgradeMode' | 'proxyAdminOwner'>,
  timelockAddress: `0x${string}` | null | undefined,
): UpgradeDelivery {
  if (entry.upgradeMode === 'uups') return 'timelock'
  if (!entry.proxyAdminOwner || !timelockAddress) return 'timelock'
  if (entry.proxyAdminOwner.toLowerCase() === timelockAddress.toLowerCase()) return 'timelock'
  return 'safe-direct'
}

const UUPS_ABI = [
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      { name: 'newImplementation', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const

export const UPGRADE_TO_AND_CALL_SELECTOR = '0x4f1ef286'
export const PROXY_ADMIN_UPGRADE_SELECTOR = '0x99a88ec4'
export const PROXY_ADMIN_UPGRADE_AND_CALL_SELECTOR = '0x9623609d'

export type DecodedUupsUpgrade = {
  method: 'upgradeToAndCall'
  proxy: `0x${string}`
  newImplementation: `0x${string}`
  initData: `0x${string}`
}

export type DecodedTransparentUpgradeAndCall = {
  method: 'upgradeAndCall'
  proxyAdmin: `0x${string}`
  proxy: `0x${string}`
  newImplementation: `0x${string}`
  initData: `0x${string}`
}

export type DecodedTransparentUpgrade = {
  method: 'upgrade'
  proxyAdmin: `0x${string}`
  proxy: `0x${string}`
  newImplementation: `0x${string}`
}

export type DecodedUpgrade =
  | DecodedUupsUpgrade
  | DecodedTransparentUpgradeAndCall
  | DecodedTransparentUpgrade

export type UpgradeScheduleArgs = {
  target: `0x${string}`
  value: bigint
  innerData: `0x${string}`
  upgradeMode: UpgradeMode
  proxy: `0x${string}`
  proxyAdminAddress?: `0x${string}`
}

export async function resolveProxyUpgradeMode(
  proxyAddress: `0x${string}`,
  config?: VaultGroupConfig,
): Promise<{ upgradeMode: UpgradeMode; proxyAdminAddress?: `0x${string}` }> {
  const proxyAdminAddress = await readProxyAdminAddress(proxyAddress)
  if (proxyAdminAddress) {
    return { upgradeMode: 'transparent', proxyAdminAddress }
  }

  if (config?.version === 2) {
    try {
      const fundAdminManager = getFundAdminManagerAddress(config)
      if (fundAdminManager.toLowerCase() === proxyAddress.toLowerCase()) {
        const overrideAdmin = config.fundAdminManagerProxyAdminAddress
        if (overrideAdmin && overrideAdmin.toLowerCase() !== ZERO_ADDRESS) {
          return {
            upgradeMode: 'transparent',
            proxyAdminAddress: getAddress(overrideAdmin) as `0x${string}`,
          }
        }
        // Perp NAV-style: ProxyAdmin.upgradeAndCall via timelock or Safe-owned ProxyAdmin
        return { upgradeMode: 'transparent' }
      }
    } catch {
      // not configured for v2
    }
  }

  return { upgradeMode: 'uups' }
}

async function resolveUpgradeMetaForContract(
  name: string,
  address: `0x${string}`,
  config: VaultGroupConfig,
): Promise<{ upgradeMode: UpgradeMode; proxyAdminAddress?: `0x${string}` }> {
  const detected = await resolveProxyUpgradeMode(address, config)
  if (PERP_NAV_STYLE_UPGRADE_NAMES.has(name) && detected.upgradeMode === 'uups') {
    const overrideAdmin = config.fundAdminManagerProxyAdminAddress
    if (overrideAdmin && overrideAdmin.toLowerCase() !== ZERO_ADDRESS) {
      return {
        upgradeMode: 'transparent',
        proxyAdminAddress: getAddress(overrideAdmin) as `0x${string}`,
      }
    }
    return { upgradeMode: 'transparent' }
  }
  return detected
}

export function buildUpgradeScheduleArgs(opts: {
  proxy: `0x${string}`
  upgradeMode: UpgradeMode
  proxyAdminAddress?: `0x${string}`
  newImplementation: `0x${string}`
  initData: `0x${string}`
}): UpgradeScheduleArgs | null {
  const { proxy, upgradeMode, proxyAdminAddress, newImplementation, initData } = opts

  if (upgradeMode === 'uups') {
    return {
      target: proxy,
      value: 0n,
      innerData: encodeFunctionData({
        abi: UUPS_ABI,
        functionName: 'upgradeToAndCall',
        args: [newImplementation, initData],
      }),
      upgradeMode: 'uups',
      proxy,
    }
  }

  if (!proxyAdminAddress) return null

  // Harmonix transparent proxies revert on ProxyAdmin.upgrade(); always use upgradeAndCall.
  const initCalldata = initData === '0x' || initData.length <= 2 ? ('0x' as `0x${string}`) : initData
  return {
    target: proxyAdminAddress,
    value: 0n,
    innerData: encodeFunctionData({
      abi: PROXY_ADMIN_ABI,
      functionName: 'upgradeAndCall',
      args: [proxy, newImplementation, initCalldata],
    }),
    upgradeMode: 'transparent',
    proxy,
    proxyAdminAddress,
  }
}

export function buildUpgradeScheduleArgsFromInputs(
  proxyInput: string,
  implInput: string,
  initDataInput: string,
  mode: UpgradeMode,
  proxyAdminAddress?: string,
): UpgradeScheduleArgs | null {
  if (!isAddress(proxyInput) || !isAddress(implInput)) return null
  const initData = initDataInput.startsWith('0x') ? (initDataInput as `0x${string}`) : '0x'
  return buildUpgradeScheduleArgs({
    proxy: getAddress(proxyInput) as `0x${string}`,
    upgradeMode: mode,
    proxyAdminAddress:
      proxyAdminAddress && isAddress(proxyAdminAddress)
        ? (getAddress(proxyAdminAddress) as `0x${string}`)
        : undefined,
    newImplementation: getAddress(implInput) as `0x${string}`,
    initData,
  })
}

export function decodeUpgradeCalldata(
  target: `0x${string}`,
  data: `0x${string}`,
): DecodedUpgrade | undefined {
  if (!data || data.length < 10) return undefined
  const selector = data.slice(0, 10).toLowerCase()

  if (selector === UPGRADE_TO_AND_CALL_SELECTOR) {
    try {
      const [newImpl, initData] = decodeAbiParameters(
        [{ type: 'address' }, { type: 'bytes' }],
        `0x${data.slice(10)}` as `0x${string}`,
      )
      return {
        method: 'upgradeToAndCall',
        proxy: getAddress(target) as `0x${string}`,
        newImplementation: getAddress(newImpl as string) as `0x${string}`,
        initData: initData as `0x${string}`,
      }
    } catch {
      return undefined
    }
  }

  if (selector === PROXY_ADMIN_UPGRADE_AND_CALL_SELECTOR) {
    try {
      const [proxy, newImpl, initData] = decodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'bytes' }],
        `0x${data.slice(10)}` as `0x${string}`,
      )
      return {
        method: 'upgradeAndCall',
        proxyAdmin: getAddress(target) as `0x${string}`,
        proxy: getAddress(proxy as string) as `0x${string}`,
        newImplementation: getAddress(newImpl as string) as `0x${string}`,
        initData: initData as `0x${string}`,
      }
    } catch {
      return undefined
    }
  }

  if (selector === PROXY_ADMIN_UPGRADE_SELECTOR) {
    try {
      const [proxy, newImpl] = decodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }],
        `0x${data.slice(10)}` as `0x${string}`,
      )
      return {
        method: 'upgrade',
        proxyAdmin: getAddress(target) as `0x${string}`,
        proxy: getAddress(proxy as string) as `0x${string}`,
        newImplementation: getAddress(newImpl as string) as `0x${string}`,
      }
    } catch {
      return undefined
    }
  }

  return undefined
}

export function formatDecodedUpgradeLabel(decoded: DecodedUpgrade): string {
  switch (decoded.method) {
    case 'upgradeToAndCall':
      return `upgradeToAndCall(${decoded.newImplementation.slice(0, 6)}…${decoded.newImplementation.slice(-4)})`
    case 'upgradeAndCall':
      return `ProxyAdmin.upgradeAndCall(${decoded.proxy.slice(0, 6)}…, ${decoded.newImplementation.slice(0, 6)}…)`
    case 'upgrade':
      return `ProxyAdmin.upgrade(${decoded.proxy.slice(0, 6)}…, ${decoded.newImplementation.slice(0, 6)}…)`
  }
}

const UPGRADE_TARGET_CONTRACTS: {
  name: string
  resolve: (config: VaultGroupConfig) => `0x${string}`
}[] = [
  {
    name: 'Fund Contract',
    resolve: (config) => getFundContractAddress(config),
  },
  {
    name: 'Balance Contract',
    resolve: (config) => getBalanceContractAddress(config),
  },
  {
    name: 'Perp NAV Contract',
    resolve: (config) => getPerpNavContractAddress(config) ?? '0x0000000000000000000000000000000000000000',
  },
  {
    name: 'Fund Contract Reader',
    resolve: (config) => getFundContractReaderAddress(config),
  },
  {
    name: 'Fund Admin Manager',
    resolve: (config) => getFundAdminManagerAddress(config),
  },
]

export async function resolveKnownContracts(config: VaultGroupConfig): Promise<KnownContract[]> {
  const candidates = UPGRADE_TARGET_CONTRACTS.filter(({ name, resolve }) => {
    if (name === 'Perp NAV Contract') {
      const addr = resolve(config)
      return addr !== '0x0000000000000000000000000000000000000000'
    }
    return true
  })

  return Promise.all(
    candidates.map(async ({ name, resolve }) => {
      const address = resolve(config)
      const { upgradeMode, proxyAdminAddress } = await resolveUpgradeMetaForContract(
        name,
        address,
        config,
      )
      const proxyAdminOwner =
        upgradeMode === 'transparent' && proxyAdminAddress
          ? await readProxyAdminOwner(proxyAdminAddress)
          : undefined
      return {
        name,
        address,
        upgradeMode,
        proxyAdminAddress,
        proxyAdminOwner,
      }
    }),
  )
}

export function buildKnownContractsShell(config: VaultGroupConfig): KnownContract[] {
  const out: KnownContract[] = UPGRADE_TARGET_CONTRACTS
    .filter(({ name }) => name !== 'Perp NAV Contract')
    .map(({ name, resolve }) => ({
      name,
      address: resolve(config),
      upgradeMode: TRANSPARENT_SHELL_NAMES.has(name) ? ('transparent' as UpgradeMode) : ('uups' as UpgradeMode),
    }))
  const perpNav = getPerpNavContractAddress(config)
  if (perpNav) {
    out.push({ name: 'Perp NAV Contract', address: perpNav, upgradeMode: 'transparent' })
  }
  return out
}
