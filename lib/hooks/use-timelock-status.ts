'use client'

import { useReadContract } from 'wagmi'
import { HA_VAULT_READER_ADDRESS, HA_VAULT_READER_ABI } from '@/lib/contracts'

type TimelockStatusResult = {
  duration: bigint
  executableAt: bigint
  isReady: boolean
  isPending: boolean
}

export function useTimelockStatus(
  target: `0x${string}` | undefined,
  calldata: `0x${string}` | undefined,
) {
  const result = useReadContract({
    address: HA_VAULT_READER_ADDRESS,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getTimelockStatus',
    args: target && calldata ? [target, calldata] : undefined,
    query: {
      enabled: Boolean(target && calldata),
      refetchInterval: 10_000,
    },
  })

  return {
    data: result.data as TimelockStatusResult | undefined,
    isLoading: result.isLoading,
    refetch: result.refetch,
  }
}

// ─── Pending FundVault operations ──────────────────────────────────────────

export type PendingOp = {
  data: `0x${string}`
  selector: `0x${string}`
  executableAt: bigint
  isReady: boolean
}

export function useFundVaultPending() {
  const result = useReadContract({
    address: HA_VAULT_READER_ADDRESS,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getFundVaultPending',
    query: {
      refetchInterval: 10_000,
    },
  })

  // wagmi returns named structs as objects, not positional tuples
  const raw = result.data as readonly { data: `0x${string}`; selector: `0x${string}`; executableAt: bigint; isReady: boolean }[] | undefined
  const ops: PendingOp[] | undefined = raw?.map((r) => ({
    data: r.data,
    selector: r.selector,
    executableAt: r.executableAt,
    isReady: r.isReady,
  }))

  return {
    data: ops,
    isLoading: result.isLoading,
    refetch: result.refetch,
  }
}
