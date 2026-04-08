'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useReadContract } from 'wagmi'
import { getAddress } from 'viem'
import type { SafeMultisigTransactionResponse } from '@safe-global/types-kit'
import { getApiKit } from './api-kit'
import { getDefaultSafeAddress } from './roles'
import type { RoleType } from './roles'
import { getSafeAddressForRole, ROLE_HASHES } from './roles'
import { initProtocolKit } from './protocol-kit'
import { decodeTransactionData, summarizeDecodedData } from './decoder'
import { HA_VAULT_READER_ADDRESS, HA_VAULT_READER_ABI } from '@/lib/contracts'
import type { PendingSafeTx, SafeInfo } from './types'

// ─── Fetch Safe Info ──────────────────────────────────────────────────────────

export function useSafeInfo(safeAddress?: `0x${string}`) {
  const addr = safeAddress ?? getDefaultSafeAddress()
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
  const addr = safeAddress ?? getDefaultSafeAddress()
  return useQuery<PendingSafeTx[]>({
    queryKey: ['safe', 'pendingTxs', addr],
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
            summary: summarizeDecodedData(dataDecoded, tx.to, tx.value ?? '0', vaultAssetMap),
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
  const addr = safeAddress ?? getDefaultSafeAddress()

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
  const addr = safeAddress ?? getDefaultSafeAddress()

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
  const addr = safeAddress ?? getDefaultSafeAddress()

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
  const addr = safeAddress ?? getDefaultSafeAddress()

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
  const safeAddress = getSafeAddressForRole(role)
  const { address, isConnected } = useAccount()
  const { data: safeInfo } = useSafeInfo(safeAddress)

  const isConfigured = Boolean(safeAddress && safeAddress !== '0x')

  const { data: hasRole } = useReadContract({
    address: HA_VAULT_READER_ADDRESS,
    abi: HA_VAULT_READER_ABI,
    functionName: 'hasRole',
    args: isConfigured
      ? [ROLE_HASHES[role], getAddress(safeAddress)]
      : undefined,
    query: { enabled: isConfigured },
  })

  const isSafeOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  return {
    safeAddress,
    isConfigured,
    isConnected,
    isSafeOwner,
    hasRole: Boolean(hasRole),
    /** True when: wallet connected + is Safe owner + Safe holds the role on-chain */
    canPropose: isConnected && isSafeOwner && Boolean(hasRole),
    safeInfo,
  }
}
