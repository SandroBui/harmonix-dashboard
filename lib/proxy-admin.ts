import { getAddress } from 'viem'
import { OWNABLE_ABI } from './abis/ownable'
import { getPublicClient } from './client'

/** EIP-1967 proxy admin storage slot. */
export const EIP1967_ADMIN_SLOT =
  '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as const

const ZERO_SLOT = `0x${'0'.repeat(64)}` as const

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
