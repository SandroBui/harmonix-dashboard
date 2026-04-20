import { getAddress } from 'viem'
import { HA_VAULT_READER_ABI, ACCESS_MANAGER_ABI } from './abis'
import { getPublicClient } from './client'
import { ROLE_HASHES, ROLE_LABELS, type RoleType } from './safe/roles'
import type { VaultGroupConfig } from './vault-group-config'

export type AddressType = 'EOA' | 'Safe' | 'Contract'

export type RoleMember = {
  address: `0x${string}`
  type: AddressType
  safeThreshold?: number
  safeSignerCount?: number
}

export type PendingGrantInfo = {
  account: `0x${string}`
  scheduledAt: number
  executableAt: number
  isReady: boolean
  accountInfo: AddressInfo
}

export type RoleInfo = {
  role: RoleType
  label: string
  hash: `0x${string}`
  members: RoleMember[]
  timelockSeconds: number
  pendingGrant: PendingGrantInfo | null
}

export type RolesPageData = {
  accessManagerAddress: `0x${string}`
  roles: RoleInfo[]
  fetchedAt: number
}

const SAFE_ABI = [
  {
    type: 'function',
    name: 'getThreshold',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOwners',
    inputs: [],
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
  },
] as const

type AddressInfo = { type: AddressType; safeThreshold?: number; safeSignerCount?: number }

async function detectAddressInfo(
  publicClient: ReturnType<typeof getPublicClient>,
  address: `0x${string}`,
): Promise<AddressInfo> {
  const bytecode = await publicClient.getBytecode({ address })
  if (!bytecode || bytecode === '0x') return { type: 'EOA' }

  try {
    const [threshold, owners] = await Promise.all([
      publicClient.readContract({ address, abi: SAFE_ABI, functionName: 'getThreshold' }) as Promise<bigint>,
      publicClient.readContract({ address, abi: SAFE_ABI, functionName: 'getOwners' }) as Promise<readonly `0x${string}`[]>,
    ])
    return { type: 'Safe', safeThreshold: Number(threshold), safeSignerCount: owners.length }
  } catch {
    return { type: 'Contract' }
  }
}

export async function getRolesPageData(config: VaultGroupConfig): Promise<RolesPageData> {
  const publicClient = getPublicClient()
  const { haVaultReaderAddress } = config

  const accessManagerAddress = await publicClient.readContract({
    address: haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getAccessManager',
  }) as `0x${string}`

  const roleTypes = Object.keys(ROLE_HASHES) as RoleType[]

  const roles: RoleInfo[] = await Promise.all(
    roleTypes.map(async (role) => {
      const hash = ROLE_HASHES[role]

      const [count, timelockRaw, pendingRaw] = await Promise.all([
        publicClient.readContract({
          address: accessManagerAddress,
          abi: ACCESS_MANAGER_ABI,
          functionName: 'getRoleMemberCount',
          args: [hash],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: accessManagerAddress,
          abi: ACCESS_MANAGER_ABI,
          functionName: 'roleTimelocks',
          args: [hash],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: accessManagerAddress,
          abi: ACCESS_MANAGER_ABI,
          functionName: 'pendingGrants',
          args: [hash],
        }) as Promise<readonly [`0x${string}`, number]>,
      ])

      const memberAddresses = await Promise.all(
        Array.from({ length: Number(count) }, (_, i) =>
          publicClient.readContract({
            address: accessManagerAddress,
            abi: ACCESS_MANAGER_ABI,
            functionName: 'getRoleMember',
            args: [hash, BigInt(i)],
          }) as Promise<`0x${string}`>
        )
      )

      const members: RoleMember[] = await Promise.all(
        memberAddresses.map(async (addr) => {
          const info = await detectAddressInfo(publicClient, addr)
          return { address: getAddress(addr) as `0x${string}`, ...info }
        })
      )

      const timelockSeconds = Number(timelockRaw)
      const [pendingAccountRaw, pendingScheduledAtRaw] = pendingRaw
      const hasPendingGrant = pendingAccountRaw.toLowerCase() !== '0x0000000000000000000000000000000000000000'

      let pendingGrant: PendingGrantInfo | null = null
      if (hasPendingGrant) {
        const account = getAddress(pendingAccountRaw) as `0x${string}`
        const scheduledAt = Number(pendingScheduledAtRaw)
        const executableAt = scheduledAt + timelockSeconds
        const now = Math.floor(Date.now() / 1000)
        const accountInfo = await detectAddressInfo(publicClient, account)
        pendingGrant = {
          account,
          scheduledAt,
          executableAt,
          isReady: now >= executableAt,
          accountInfo,
        }
      }

      return {
        role,
        label: ROLE_LABELS[role],
        hash,
        members,
        timelockSeconds,
        pendingGrant,
      }
    })
  )

  return {
    accessManagerAddress: getAddress(accessManagerAddress) as `0x${string}`,
    roles,
    fetchedAt: Date.now(),
  }
}
