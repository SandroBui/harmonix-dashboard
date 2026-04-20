'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useReadContract } from 'wagmi'
import { getAddress } from 'viem'
import type { SafeMultisigTransactionResponse } from '@safe-global/types-kit'
import { getApiKit } from './api-kit'
import { DYNAMIC_SAFE_ROLES, getDefaultSafeAddress, getResolvedSafeAddressForRole, ROLE_HASHES } from './roles'
import type { RoleType, ResolvedRoleSafes } from './roles'
import { initProtocolKit } from './protocol-kit'
import { decodeTransactionData, summarizeDecodedData } from './decoder'
import { ACCESS_MANAGER_ABI, HA_VAULT_READER_ABI } from '@/lib/contracts'
import { getPublicClient } from '@/lib/client'
import { useVaultConfig } from '@/lib/vault-context'
import { useAssetMetadata } from '@/lib/hooks/use-asset-metadata'
import type { PendingSafeTx, SafeInfo } from './types'

async function detectAddressType(address: `0x${string}`): Promise<'EOA' | 'Safe' | 'Contract'> {
  const publicClient = getPublicClient()
  const bytecode = await publicClient.getBytecode({ address })
  if (!bytecode || bytecode === '0x') return 'EOA'

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

  try {
    await Promise.all([
      publicClient.readContract({ address, abi: SAFE_ABI, functionName: 'getThreshold' }),
      publicClient.readContract({ address, abi: SAFE_ABI, functionName: 'getOwners' }),
    ])
    return 'Safe'
  } catch {
    return 'Contract'
  }
}

export function useResolvedRoleSafes() {
  const config = useVaultConfig()

  return useQuery<{ resolvedSafes: ResolvedRoleSafes; sentinelEoas: `0x${string}`[] }>({
    queryKey: ['safe', 'resolvedRoleSafes', config.haVaultReaderAddress],
    queryFn: async () => {
      const publicClient = getPublicClient()

      const accessManagerAddress = await publicClient.readContract({
        address: config.haVaultReaderAddress,
        abi: HA_VAULT_READER_ABI,
        functionName: 'getAccessManager',
      }) as `0x${string}`

      const resolvedSafes: ResolvedRoleSafes = {}

      for (const role of DYNAMIC_SAFE_ROLES) {
        const roleHash = ROLE_HASHES[role]
        const count = await publicClient.readContract({
          address: accessManagerAddress,
          abi: ACCESS_MANAGER_ABI,
          functionName: 'getRoleMemberCount',
          args: [roleHash],
        }) as bigint

        for (let i = 0; i < Number(count); i += 1) {
          const member = await publicClient.readContract({
            address: accessManagerAddress,
            abi: ACCESS_MANAGER_ABI,
            functionName: 'getRoleMember',
            args: [roleHash, BigInt(i)],
          }) as `0x${string}`

          const type = await detectAddressType(member)
          if (type === 'Safe') {
            resolvedSafes[role] = getAddress(member) as `0x${string}`
            break
          }
        }
      }

      const sentinelEoas: `0x${string}`[] = []
      const sentinelCount = await publicClient.readContract({
        address: accessManagerAddress,
        abi: ACCESS_MANAGER_ABI,
        functionName: 'getRoleMemberCount',
        args: [ROLE_HASHES.sentinel],
      }) as bigint

      for (let i = 0; i < Number(sentinelCount); i += 1) {
        const member = await publicClient.readContract({
          address: accessManagerAddress,
          abi: ACCESS_MANAGER_ABI,
          functionName: 'getRoleMember',
          args: [ROLE_HASHES.sentinel, BigInt(i)],
        }) as `0x${string}`

        const type = await detectAddressType(member)
        if (type === 'EOA') sentinelEoas.push(getAddress(member) as `0x${string}`)
      }

      return { resolvedSafes, sentinelEoas }
    },
    staleTime: 60_000,
  })
}

// ─── Fetch Safe Info ──────────────────────────────────────────────────────────

export function useSafeInfo(safeAddress?: `0x${string}`) {
  const config = useVaultConfig()
  const addr = safeAddress ?? getDefaultSafeAddress(config)
  return useQuery<SafeInfo>({
    queryKey: ['safe', 'info', addr],
    queryFn: async () => {
      const apiKit = getApiKit()
      const info = await apiKit.getSafeInfo(addr)
      return {
        address: addr,
        owners: info.owners,
        threshold: info.threshold,
        nonce: info.nonce,
      }
    },
    staleTime: 60_000,
    enabled: Boolean(addr && addr !== '0x'),
  })
}

// ─── Fetch Pending Transactions ───────────────────────────────────────────────

export function usePendingSafeTransactions(safeAddress?: `0x${string}`, vaultAssetMap?: Record<string, string>) {
  const config = useVaultConfig()
  const { data: assetMetadata } = useAssetMetadata()
  const addr = safeAddress ?? getDefaultSafeAddress(config)
  return useQuery<PendingSafeTx[]>({
    queryKey: ['safe', 'pendingTxs', addr, assetMetadata],
    queryFn: async () => {
      const apiKit = getApiKit()
      const response = await apiKit.getPendingTransactions(addr)

      return Promise.all(
        (response.results as SafeMultisigTransactionResponse[]).map(async (tx) => {
          const dataDecoded = tx.data
            ? await decodeTransactionData(tx.data, tx.to)
            : null
          const confirmationsCount = tx.confirmations?.length ?? 0
          return {
            safeTxHash: tx.safeTxHash,
            to: tx.to,
            value: tx.value ?? '0',
            data: tx.data ?? null,
            operation: tx.operation ?? 0,
            nonce: tx.nonce,
            submissionDate: tx.modified ?? tx.submissionDate,
            confirmationsRequired: tx.confirmationsRequired,
            confirmations: tx.confirmations ?? [],
            confirmationsCount,
            isExecutable: confirmationsCount >= tx.confirmationsRequired,
            dataDecoded,
            summary: summarizeDecodedData(dataDecoded, tx.to, tx.value ?? '0', vaultAssetMap, assetMetadata ?? {}),
          } satisfies PendingSafeTx
        }),
      )
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    enabled: Boolean(addr && addr !== '0x'),
  })
}

// ─── Sign (Confirm) a Pending Transaction ─────────────────────────────────────

export function useConfirmSafeTransaction(safeAddress?: `0x${string}`) {
  const queryClient = useQueryClient()
  const { address, connector } = useAccount()
  const config = useVaultConfig()
  const addr = safeAddress ?? getDefaultSafeAddress(config)

  return useMutation({
    mutationFn: async ({ safeTxHash }: { safeTxHash: string }) => {
      if (!address) throw new Error('Wallet not connected')
      if (!connector) throw new Error('Connector not ready')

      const provider = await connector.getProvider()

      const protocolKit = await initProtocolKit(provider, address, addr)
      const apiKit = getApiKit()

      const pendingTx = await apiKit.getTransaction(safeTxHash)
      const signedTx = await protocolKit.signTransaction(pendingTx)

      const sig = signedTx.getSignature(address.toLowerCase())
      if (!sig) throw new Error('Failed to generate signature')

      await apiKit.confirmTransaction(safeTxHash, sig.data)
      return { safeTxHash }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safe', 'pendingTxs'] })
    },
  })
}

// ─── Execute a Transaction (threshold met) ────────────────────────────────────

export function useExecuteSafeTransaction(safeAddress?: `0x${string}`) {
  const queryClient = useQueryClient()
  const { address, connector } = useAccount()
  const config = useVaultConfig()
  const addr = safeAddress ?? getDefaultSafeAddress(config)

  return useMutation({
    mutationFn: async ({ safeTxHash }: { safeTxHash: string }) => {
      if (!address) throw new Error('Wallet not connected')
      if (!connector) throw new Error('Connector not ready')

      const provider = await connector.getProvider()

      const protocolKit = await initProtocolKit(provider, address, addr)
      const apiKit = getApiKit()

      const pendingTx = await apiKit.getTransaction(safeTxHash)
      const safeTransaction = await protocolKit.toSafeTransactionType(pendingTx)
      const result = await protocolKit.executeTransaction(safeTransaction)

      return { hash: result.hash, safeTxHash }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safe', 'pendingTxs'] })
      queryClient.invalidateQueries({ queryKey: ['safe', 'info'] })
    },
  })
}

// ─── Propose a New Safe Transaction ──────────────────────────────────────────

export function useProposeSafeTransaction(safeAddress?: `0x${string}`) {
  const queryClient = useQueryClient()
  const { address, connector } = useAccount()
  const config = useVaultConfig()
  const addr = safeAddress ?? getDefaultSafeAddress(config)

  return useMutation({
    mutationFn: async ({
      to,
      data,
      value = '0',
    }: {
      to: `0x${string}`
      data: `0x${string}`
      value?: string
    }) => {
      if (!address) throw new Error('Wallet not connected')
      if (!connector) throw new Error('Connector not ready')

      const provider = await connector.getProvider()
      const protocolKit = await initProtocolKit(provider, address, addr)
      const apiKit = getApiKit()

      // Find the highest nonce already queued so the new tx is appended after
      // all pending (unexecuted) transactions rather than conflicting with them.
      const pending = await apiKit.getPendingTransactions(addr)
      const pendingNonces = (pending.results as SafeMultisigTransactionResponse[]).map((tx) => Number(tx.nonce))
      const nextNonce = pendingNonces.length > 0
        ? Math.max(...pendingNonces) + 1
        : undefined // empty queue -> let SDK use the on-chain nonce (already correct)

      const safeTransaction = await protocolKit.createTransaction({
        transactions: [{ to: getAddress(to), data, value }],
        ...(nextNonce !== undefined ? { options: { nonce: nextNonce } } : {}),
      })

      const signedTx = await protocolKit.signTransaction(safeTransaction)
      const safeTxHash = await protocolKit.getTransactionHash(signedTx)

      const sig = signedTx.getSignature(address.toLowerCase())
      if (!sig) throw new Error('Failed to generate signature')

      await apiKit.proposeTransaction({
        safeAddress: addr,
        safeTransactionData: signedTx.data,
        safeTxHash,
        senderAddress: address,
        senderSignature: sig.data,
      })

      return { safeTxHash }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safe', 'pendingTxs'] })
    },
  })
}

// ─── Cancel (Reject) a Pending Transaction ───────────────────────────────────

export function useCancelSafeTransaction(safeAddress?: `0x${string}`) {
  const queryClient = useQueryClient()
  const { address, connector } = useAccount()
  const config = useVaultConfig()
  const addr = safeAddress ?? getDefaultSafeAddress(config)

  return useMutation({
    mutationFn: async ({ nonce }: { nonce: number }) => {
      if (!address) throw new Error('Wallet not connected')
      if (!connector) throw new Error('Connector not ready')

      const provider = await connector.getProvider()
      const protocolKit = await initProtocolKit(provider, address, addr)
      const apiKit = getApiKit()

      const rejectionTx = await protocolKit.createRejectionTransaction(nonce)
      const signedTx = await protocolKit.signTransaction(rejectionTx)
      const safeTxHash = await protocolKit.getTransactionHash(signedTx)

      const sig = signedTx.getSignature(address.toLowerCase())
      if (!sig) throw new Error('Failed to generate signature')

      await apiKit.proposeTransaction({
        safeAddress: addr,
        safeTransactionData: signedTx.data,
        safeTxHash,
        senderAddress: address,
        senderSignature: sig.data,
      })

      return { safeTxHash }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safe', 'pendingTxs'] })
    },
  })
}

// ─── On-chain Role Check ─────────────────────────────────────────────────────

/**
 * Checks whether a Safe address holds a specific role on-chain via VaultReader.hasRole().
 * Also checks if the connected wallet is an owner of that Safe.
 */
export function useRoleCheck(role: RoleType) {
  const config = useVaultConfig()
  const { data: resolved } = useResolvedRoleSafes()
  const safeAddress = getResolvedSafeAddressForRole(config, role, resolved?.resolvedSafes)
  const { address, isConnected } = useAccount()
  const { data: safeInfo } = useSafeInfo(safeAddress)

  const isConfigured = Boolean(safeAddress && safeAddress !== '0x')

  const { data: hasRole } = useReadContract({
    address: config.haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'hasRole',
    args: isConfigured
      ? [ROLE_HASHES[role], getAddress(safeAddress)]
      : undefined,
    query: { enabled: isConfigured && role !== 'sentinel' },
  })

  const sentinelHasRole = Boolean(
    role === 'sentinel' &&
    address &&
    resolved?.sentinelEoas.some((eoa) => eoa.toLowerCase() === address.toLowerCase()),
  )

  const isSafeOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const effectiveHasRole = role === 'sentinel' ? sentinelHasRole : Boolean(hasRole)

  return {
    safeAddress,
    isConfigured,
    isConnected,
    isSafeOwner,
    hasRole: effectiveHasRole,
    canPropose: isConnected && (role === 'sentinel' ? effectiveHasRole : isSafeOwner && effectiveHasRole),
    safeInfo,
  }
}
