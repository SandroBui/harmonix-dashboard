'use client'

import { useReadContract } from 'wagmi'
import { FUND_NAV_FEED_ABI, VAULT_MANAGER_ABI } from '@/lib/contracts'
import { useFundNavFeedAddress } from './use-fund-nav-feed'

/**
 * Resolves the VaultManager address by reading `vaultManager()` from FundNavFeed.
 * Returns undefined while loading.
 */
export function useVaultManagerAddress(): `0x${string}` | undefined {
  const fundNavFeedAddress = useFundNavFeedAddress()
  const { data } = useReadContract({
    address: fundNavFeedAddress,
    abi: FUND_NAV_FEED_ABI,
    functionName: 'vaultManager',
    query: { enabled: Boolean(fundNavFeedAddress), staleTime: 300_000 },
  })
  return data as `0x${string}` | undefined
}

export type LiveNavSnapshot = {
  // Live values — recomputed by computeNav() on each call
  livePpsValue: bigint
  navDenomination: bigint
  effNavDenomination: bigint
  isValidPps: boolean
  // Stored PPS from the last updateNav() call. Often lags livePpsValue between
  // syncs — the multiSend's trailing updateNav() will close the gap.
  storedPps: bigint
}

/**
 * Live read of `VaultManager.computeNav()` + `pricePerShare()` — the executor
 * of a NAV-touching Safe tx benefits from seeing both the *would-be* PPS
 * (live) and the *currently stored* PPS that on-chain consumers still see.
 * Pass `enabled=false` to skip the reads.
 */
export function useLiveNavSnapshot(options?: { enabled?: boolean }): {
  data: LiveNavSnapshot | undefined
  isLoading: boolean
  isError: boolean
} {
  const vaultManagerAddress = useVaultManagerAddress()
  const enabled = options?.enabled !== false && Boolean(vaultManagerAddress)

  const navQ = useReadContract({
    address: vaultManagerAddress,
    abi: VAULT_MANAGER_ABI,
    functionName: 'computeNav',
    query: { enabled, staleTime: 15_000 },
  })
  const storedPpsQ = useReadContract({
    address: vaultManagerAddress,
    abi: VAULT_MANAGER_ABI,
    functionName: 'pricePerShare',
    query: { enabled, staleTime: 15_000 },
  })

  const navResult = navQ.data as
    | {
        navDenomination: bigint
        effNavDenomination: bigint
        ppsValue: bigint
        isValidPps: boolean
      }
    | undefined
  const storedPps = storedPpsQ.data as bigint | undefined

  return {
    data: navResult && storedPps !== undefined
      ? {
          livePpsValue: navResult.ppsValue,
          navDenomination: navResult.navDenomination,
          effNavDenomination: navResult.effNavDenomination,
          isValidPps: navResult.isValidPps,
          storedPps,
        }
      : undefined,
    isLoading: navQ.isLoading || storedPpsQ.isLoading,
    isError: navQ.isError || storedPpsQ.isError,
  }
}
