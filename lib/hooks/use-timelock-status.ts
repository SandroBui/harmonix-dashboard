'use client'

import { useReadContract } from 'wagmi'
import { HA_VAULT_READER_ABI } from '@/lib/contracts'
import { useVaultConfig } from '@/lib/vault-context'

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
  const { haVaultReaderAddress } = useVaultConfig()
  const result = useReadContract({
    address: haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getTimelockStatus',
    args: target && calldata ? [target, calldata] : undefined,
    query: {
      enabled: Boolean(target && calldata),
      refetchInterval: 10_000,
    },
  })

  const raw = result.data as readonly [bigint, bigint, boolean, boolean] | undefined

  return {
    data: raw ? { duration: raw[0], executableAt: raw[1], isReady: raw[2], isPending: raw[3] } as TimelockStatusResult : undefined,
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

export function useFundVaultPending(fundVaultAddress: `0x${string}`) {
  const { haVaultReaderAddress } = useVaultConfig()
  const result = useReadContract({
    address: haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getContractPending',
    args: [fundVaultAddress],
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
