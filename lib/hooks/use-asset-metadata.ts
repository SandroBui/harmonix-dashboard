'use client'

import { useQuery } from '@tanstack/react-query'
import { useVaultConfig } from '@/lib/vault-context'
import { fetchAssetMetadata } from '@/lib/asset-metadata'
import type { AssetMeta } from '@/lib/vault-group-config'

export function useAssetMetadata(): {
  data: Record<string, AssetMeta> | undefined
  isLoading: boolean
} {
  const { haVaultReaderAddress } = useVaultConfig()
  return useQuery({
    queryKey: ['assetMetadata', haVaultReaderAddress],
    queryFn: () => fetchAssetMetadata(haVaultReaderAddress),
    staleTime: 5 * 60_000,
  })
}
