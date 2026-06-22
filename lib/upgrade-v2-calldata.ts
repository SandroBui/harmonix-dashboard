import { decodeAbiParameters, encodeFunctionData, getAddress, isAddress } from 'viem'
import { PROXY_ADMIN_ABI } from './abis/proxy-admin'
import { readProxyAdminAddress } from './proxy-admin'
import {
  getBalanceContractAddress,
  getFundContractAddress,
  getPerpNavContractAddress,
} from './nav-contract-targets'
import type { VaultGroupConfig } from './vault-group-config'

export type UpgradeMode = 'uups' | 'transparent'

export type KnownContract = {
  name: string
  address: `0x${string}`
  upgradeMode: UpgradeMode
  proxyAdminAddress?: `0x${string}`
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
): Promise<{ upgradeMode: UpgradeMode; proxyAdminAddress?: `0x${string}` }> {
  const proxyAdminAddress = await readProxyAdminAddress(proxyAddress)
  if (proxyAdminAddress) {
    return { upgradeMode: 'transparent', proxyAdminAddress }
  }
  return { upgradeMode: 'uups' }
}

export function buildUpgradeScheduleArgs(opts: {
  proxy: `0x${string}`
  upgradeMode: UpgradeMode
  proxyAdminAddress?: `0x${string}`
  newImplementation: `0x${string}`
  initData: `0x${string}`
}): UpgradeScheduleArgs | null {
  const { proxy, upgradeMode, proxyAdminAddress, newImplementation, initData } = opts
  const hasInit = initData !== '0x' && initData.length > 2

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

  if (hasInit) {
    return {
      target: proxyAdminAddress,
      value: 0n,
      innerData: encodeFunctionData({
        abi: PROXY_ADMIN_ABI,
        functionName: 'upgradeAndCall',
        args: [proxy, newImplementation, initData],
      }),
      upgradeMode: 'transparent',
      proxy,
      proxyAdminAddress,
    }
  }

  return {
    target: proxyAdminAddress,
    value: 0n,
    innerData: encodeFunctionData({
      abi: PROXY_ADMIN_ABI,
      functionName: 'upgrade',
      args: [proxy, newImplementation],
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
      const { upgradeMode, proxyAdminAddress } = await resolveProxyUpgradeMode(address)
      return {
        name,
        address,
        upgradeMode,
        proxyAdminAddress,
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
      upgradeMode: 'uups' as UpgradeMode,
    }))
  const perpNav = getPerpNavContractAddress(config)
  if (perpNav) {
    out.push({ name: 'Perp NAV Contract', address: perpNav, upgradeMode: 'uups' })
  }
  return out
}
