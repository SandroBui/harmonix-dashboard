'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { VAULT_ASSET_ABI } from '@/lib/abis'
import {
  useProposeSafeMultiSendTransaction,
  useProposeSafeTransaction,
  useResolvedRoleSafes,
} from '@/lib/safe/hooks'
import { getResolvedSafeAddressForRole } from '@/lib/safe/roles'
import { useVaultConfig } from '@/lib/vault-context'
import { useAssetMetadata } from '@/lib/hooks/use-asset-metadata'
import type { SafeInfo } from '@/lib/safe/types'
import type { Withdrawal } from '@/lib/vault-reader'

type Props = {
  selected: Withdrawal[]
  vaultAssetMap: Record<string, string>
  safeInfo: SafeInfo | undefined
  hasOperatorRole: boolean
  onSuccess: () => void
}

function formatUnits(value: string, decimals: number): string {
  const bn = BigInt(value)
  if (bn === 0n) return '0'
  const divisor = 10n ** BigInt(decimals)
  const whole = bn / divisor
  const frac = bn % divisor
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 4)
  return `${whole.toLocaleString()}.${fracStr}`
}

export default function RedeemPanel({
  selected,
  vaultAssetMap,
  safeInfo,
  hasOperatorRole,
  onSuccess,
}: Props) {
  const { address, isConnected, chainId } = useAccount()
  const config = useVaultConfig()
  const { data: assetMetadata } = useAssetMetadata()
  const { data: resolved } = useResolvedRoleSafes()
  const operatorSafeAddress = getResolvedSafeAddressForRole(config, 'operator', resolved?.resolvedSafes)

  const proposeTx = useProposeSafeTransaction(operatorSafeAddress)
  const proposeMultiSendTx = useProposeSafeMultiSendTransaction(operatorSafeAddress)

  const isBatch = selected.length > 1
  const activeTx = isBatch ? proposeMultiSendTx : proposeTx

  useEffect(() => {
    if (activeTx.isSuccess) {
      const t = setTimeout(() => {
        activeTx.reset()
        onSuccess()
      }, 1000)
      return () => clearTimeout(t)
    }
  }, [activeTx.isSuccess, onSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const redeemCalls = useMemo(() => {
    if (selected.length === 0) return null
    const vaultAddress = getAddress(selected[0].vault) as `0x${string}`
    return selected.map((w) => {
      const controller = getAddress(w.controller) as `0x${string}`
      return {
        to: vaultAddress,
        data: encodeFunctionData({
          abi: VAULT_ASSET_ABI,
          functionName: 'redeem',
          args: [BigInt(w.shares), controller, controller],
        }),
      }
    })
  }, [selected])

  if (selected.length === 0 || !redeemCalls) return null

  const vaultAddress = getAddress(selected[0].vault) as `0x${string}`
  const assetAddr = vaultAssetMap[selected[0].vault]
  const meta = assetAddr ? assetMetadata?.[assetAddr] : undefined

  const estimatedOutflow = selected.reduce((sum, w) => sum + BigInt(w.assets), 0n)

  const isWrongChain = isConnected && chainId !== 999
  const isOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  function handleProposeSafe() {
    if (!redeemCalls) return
    if (isBatch) {
      proposeMultiSendTx.reset()
      proposeMultiSendTx.mutate({ txs: redeemCalls })
    } else {
      proposeTx.reset()
      proposeTx.mutate({ to: vaultAddress, data: redeemCalls[0].data })
    }
  }

  let safeLabel: string
  let safeDisabled = false
  let safeClass = 'bg-emerald-600 text-white hover:bg-emerald-700'

  if (!isConnected) {
    safeLabel = 'Connect wallet'
    safeDisabled = true
    safeClass =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    safeLabel = 'Wrong network'
    safeDisabled = true
    safeClass = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!isOwner) {
    safeLabel = 'Not a Safe owner'
    safeDisabled = true
    safeClass =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!hasOperatorRole) {
    safeLabel = 'Safe lacks OPERATOR_ROLE'
    safeDisabled = true
    safeClass =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (activeTx.isPending) {
    safeLabel = 'Confirm in wallet…'
    safeDisabled = true
  } else if (activeTx.isSuccess) {
    safeLabel = '✓ Proposed'
    safeDisabled = true
    safeClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (activeTx.isError) {
    safeLabel = 'Failed — Retry'
    safeClass = 'bg-red-600 text-white hover:bg-red-700'
  } else {
    safeLabel = isBatch ? `Propose ${selected.length} redeems via Safe` : 'Redeem on behalf via Safe'
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-emerald-200 bg-white px-4 py-3 shadow-lg dark:border-emerald-900/40 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
            Redeem mode
          </span>
          <span className="text-neutral-400">·</span>
          <span className="font-medium text-neutral-900 dark:text-white">
            {selected.length} request{selected.length > 1 ? 's' : ''} selected
          </span>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-600 dark:text-neutral-300">
            Est. payout:{' '}
            <span className="font-medium text-neutral-900 dark:text-white">
              {meta
                ? formatUnits(estimatedOutflow.toString(), meta.decimals)
                : estimatedOutflow.toString()}
              {meta && <span className="ml-1 text-neutral-500">{meta.symbol}</span>}
            </span>
          </span>
          {isBatch && (
            <>
              <span className="text-neutral-400">·</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Atomic batch — any revert rolls back all
              </span>
            </>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="hidden text-xs text-neutral-400 sm:inline dark:text-neutral-500">
            Status updates after the Safe transaction is executed.
          </span>

          {activeTx.error && (
            <span
              className="max-w-xs cursor-help truncate text-xs text-red-600 dark:text-red-400"
              title={activeTx.error.message}
            >
              {activeTx.error.message}
            </span>
          )}

          {activeTx.isPending && (
            <svg
              className="h-4 w-4 animate-spin text-neutral-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}

          {activeTx.isSuccess && (
            <Link
              href="/safe-transactions"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View pending →
            </Link>
          )}

          <button
            onClick={handleProposeSafe}
            disabled={safeDisabled}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${safeClass}`}
          >
            {safeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
