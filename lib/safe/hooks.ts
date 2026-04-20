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
import type { PendingSafeTx, SafeInfo, FulfillPrecheck } from './types'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const maybeStatus = (error as { status?: unknown }).status
  if (typeof maybeStatus === 'number') return maybeStatus

  const response = (error as { response?: { status?: unknown } }).response
  if (response && typeof response.status === 'number') return response.status

  const cause = (error as { cause?: { status?: unknown } }).cause
  if (cause && typeof cause.status === 'number') return cause.status

  const message = (error as { message?: unknown }).message
  if (typeof message === 'string') {
    const match = message.match(/\b(\d{3})\b/)
    if (match) return Number(match[1])
  }

  return undefined
}

function isRateLimitedError(error: unknown): boolean {
  if (getErrorStatus(error) === 429) return true
  const message = typeof (error as { message?: unknown })?.message === 'string'
    ? ((error as { message: string }).message).toLowerCase()
    : ''
  return message.includes('429') || message.includes('too many requests') || message.includes('rate limit')
}

function getVaultAssetMapKey(vaultAssetMap?: Record<string, string>): string {
  if (!vaultAssetMap) return ''
  return Object.entries(vaultAssetMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vault, asset]) => `${vault}:${asset}`)
    .join('|')
}

function getAssetMetadataKey(
  assetMetadata?: Record<string, { symbol: string; decimals: number }>,
): string {
  if (!assetMetadata) return ''
  return Object.entries(assetMetadata)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([asset, meta]) => `${asset}:${meta.symbol}:${meta.decimals}`)
    .join('|')
}

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
    staleTime: 300_000,
    enabled: Boolean(addr && addr !== '0x'),
  })
}

// ─── Fetch Pending Transactions ───────────────────────────────────────────────

export function usePendingSafeTransactions(safeAddress?: `0x${string}`, vaultAssetMap?: Record<string, string>) {
  const config = useVaultConfig()
  const { data: assetMetadata } = useAssetMetadata()
  const addr = safeAddress ?? getDefaultSafeAddress(config)
  const vaultAssetMapKey = getVaultAssetMapKey(vaultAssetMap)
  const assetMetadataKey = getAssetMetadataKey(assetMetadata)
  return useQuery<PendingSafeTx[]>({
    queryKey: ['safe', 'pendingTxs', addr, config.haVaultReaderAddress, vaultAssetMapKey, assetMetadataKey],
    queryFn: async () => {
      const apiKit = getApiKit()
      const response = await apiKit.getPendingTransactions(addr)
      const txs = response.results as SafeMultisigTransactionResponse[]
      const decodedResults = await Promise.all(
        txs.map(async (tx) => ({
          tx,
          dataDecoded: tx.data ? await decodeTransactionData(tx.data, tx.to) : null,
        })),
      )

      const publicClient = getPublicClient()
      let fundVaultAddress: `0x${string}` | null = null
      const fulfillInfo = new Map<string, { totalAmount: bigint; assetAddress: `0x${string}` }>()
      const neededAssets = new Set<`0x${string}`>()

      for (const { tx, dataDecoded } of decodedResults) {
        if (dataDecoded?.method !== 'fulfillRedeem') continue
        const totalAmountParam = dataDecoded.parameters.find((p) => p.name === 'totalAmount')
        const tokenAddr = vaultAssetMap?.[tx.to.toLowerCase()]
        if (!totalAmountParam || !tokenAddr) continue
        try {
          const totalAmount = BigInt(totalAmountParam.value)
          const normalizedAsset = getAddress(tokenAddr) as `0x${string}`
          fulfillInfo.set(tx.safeTxHash, { totalAmount, assetAddress: normalizedAsset })
          neededAssets.add(normalizedAsset)
        } catch {
          // ignore malformed fulfill params and continue rendering transactions
        }
      }

      const fundVaultBalances = new Map<string, bigint>()
      if (neededAssets.size > 0) {
        try {
          fundVaultAddress = await publicClient.readContract({
            address: config.haVaultReaderAddress,
            abi: HA_VAULT_READER_ABI,
            functionName: 'getFundVault',
          }) as `0x${string}`

          await Promise.all(
            Array.from(neededAssets).map(async (assetAddress) => {
              const balance = await publicClient.readContract({
                address: assetAddress,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [fundVaultAddress as `0x${string}`],
              }) as bigint
              fundVaultBalances.set(assetAddress.toLowerCase(), balance)
            }),
          )
        } catch {
          // fail-soft: precheck metadata omitted if on-chain reads fail
        }
      }

      return decodedResults.map(({ tx, dataDecoded }) => {
        const confirmationsCount = tx.confirmations?.length ?? 0
        let fulfillPrecheck: FulfillPrecheck | undefined

        const pre = fulfillInfo.get(tx.safeTxHash)
        if (pre && fundVaultAddress) {
          const meta = (assetMetadata ?? {})[pre.assetAddress.toLowerCase()]
          const decimals = meta?.decimals ?? 18
          const symbol = meta?.symbol ?? pre.assetAddress.slice(0, 10)
          const fundVaultBalance = fundVaultBalances.get(pre.assetAddress.toLowerCase())
          if (fundVaultBalance !== undefined) {
            const isInsufficient = fundVaultBalance < pre.totalAmount
            const shortfall = isInsufficient ? pre.totalAmount - fundVaultBalance : 0n
            fulfillPrecheck = {
              fundVaultAddress,
              assetAddress: pre.assetAddress.toLowerCase(),
              symbol,
              decimals,
              requiredAmount: pre.totalAmount.toString(),
              fundVaultBalance: fundVaultBalance.toString(),
              shortfall: shortfall.toString(),
              isInsufficient,
            }
          }
        }

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
          fulfillPrecheck,
        } satisfies PendingSafeTx
      })
    },
    refetchInterval: (query) => {
      if (isRateLimitedError(query.state.error)) return 90_000
      const hasPending = (query.state.data?.length ?? 0) > 0
      return hasPending ? 30_000 : 60_000
    },
    staleTime: 30_000,
    enabled: Boolean(addr && addr !== '0x'),
    refetchIntervalInBackground: false,
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
