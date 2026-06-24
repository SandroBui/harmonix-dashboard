import { getAddress } from 'viem'
import { OWNABLE_ABI } from './abis/ownable'
import { getPublicClient } from './client'
import { getFundAdminManagerAddress } from './vault-contract-reader'
import type { VaultGroupConfig } from './vault-group-config'

/** EIP-1967 proxy admin storage slot. */
export const EIP1967_ADMIN_SLOT =
  '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as const

const ZERO_SLOT = `0x${'0'.repeat(64)}` as const
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export async function readProxyAdminAddress(
  proxyAddress: `0x${string}`,
): Promise<`0x${string}` | null> {
  const client = getPublicClient()
  const slot = await client.getStorageAt({
    address: proxyAddress,
    slot: EIP1967_ADMIN_SLOT,
  })
  if (!slot || slot === ZERO_SLOT) return null
  return getAddress(`0x${slot.slice(-40)}`) as `0x${string}`
}

/** EIP-1967 admin slot with optional config override (Fund Admin Manager). */
export async function resolveProxyAdminForTarget(
  proxyAddress: `0x${string}`,
  config?: VaultGroupConfig,
): Promise<`0x${string}` | null> {
  const fromSlot = await readProxyAdminAddress(proxyAddress)
  if (fromSlot) return fromSlot

  if (config?.version === 2) {
    try {
      const fundAdminManager = getFundAdminManagerAddress(config)
      if (fundAdminManager.toLowerCase() === proxyAddress.toLowerCase()) {
        const override = config.fundAdminManagerProxyAdminAddress
        if (override && override.toLowerCase() !== ZERO_ADDRESS) {
          return getAddress(override) as `0x${string}`
        }
      }
    } catch {
      // not configured for v2
    }
  }

  return null
}

export async function readProxyAdminOwner(
  proxyAdminAddress: `0x${string}`,
): Promise<`0x${string}`> {
  const client = getPublicClient()
  const owner = await client.readContract({
    address: proxyAdminAddress,
    abi: OWNABLE_ABI,
    functionName: 'owner',
  })
  return getAddress(owner) as `0x${string}`
}
