import { HA_VAULT_READER_ABI } from './contracts'
import { getPublicClient } from './client'
import type { AssetMeta } from './vault-group-config'

const ERC20_METADATA_ABI = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

/**
 * Fetches ERC-20 symbol and decimals for the given token addresses.
 * Used by server-side readers that already know the asset addresses.
 */
export async function fetchAssetMetadataForAddresses(
  addresses: readonly `0x${string}`[],
): Promise<Record<string, AssetMeta>> {
  const publicClient = getPublicClient()
  const entries = await Promise.all(
    addresses.map(async (addr) => {
      try {
        const [symbol, decimals] = await Promise.all([
          publicClient.readContract({
            address: addr,
            abi: ERC20_METADATA_ABI,
            functionName: 'symbol',
          }) as Promise<string>,
          publicClient.readContract({
            address: addr,
            abi: ERC20_METADATA_ABI,
            functionName: 'decimals',
          }) as Promise<number>,
        ])
        return [addr.toLowerCase(), { symbol, decimals }] as const
      } catch {
        return [addr.toLowerCase(), { symbol: addr.slice(0, 10), decimals: 18 }] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}

/**
 * Fetches all registered assets from HaVaultReader, then queries their
 * ERC-20 symbol and decimals. Used by the client-side hook.
 */
export async function fetchAssetMetadata(
  haVaultReaderAddress: `0x${string}`,
): Promise<Record<string, AssetMeta>> {
  const publicClient = getPublicClient()
  const assets = await publicClient.readContract({
    address: haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getRegisteredAssets',
  })
  return fetchAssetMetadataForAddresses(assets as readonly `0x${string}`[])
}
