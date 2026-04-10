'use client'

import { useReadContract } from 'wagmi'
import { HA_VAULT_READER_ABI } from '@/lib/contracts'
import { useVaultConfig } from '@/lib/vault-context'

/**
 * Reads the FundNavFeed contract address from HaVaultReader.getFundNav().
 * Returns undefined while loading.
 */
export function useFundNavFeedAddress(): `0x${string}` | undefined {
  const { haVaultReaderAddress } = useVaultConfig()
  const { data } = useReadContract({
    address: haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getFundNav',
    query: { staleTime: 300_000 },
  })
  return data as `0x${string}` | undefined
}
