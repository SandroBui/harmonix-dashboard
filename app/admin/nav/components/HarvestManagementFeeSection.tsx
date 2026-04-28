'use client'

import Link from 'next/link'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { VAULT_MANAGER_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useResolvedRoleSafes } from '@/lib/safe/hooks'
import { getResolvedSafeAddressForRole } from '@/lib/safe/roles'
import { useVaultConfig } from '@/lib/vault-context'
import { formatDenomination, formatTokenAmount, truncateAddress } from '@/lib/format'
import type { NavPageData } from '@/lib/nav-reader'

type Props = {
  data: NavPageData
  /** True when: Safe has OPERATOR_ROLE AND connected wallet is a Safe owner */
  canPropose: boolean
  isConnected: boolean
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function formatTimestamp(seconds: string): string {
  if (seconds === '0') return 'Never'
  const ms = Number(seconds) * 1_000
  if (!Number.isFinite(ms) || ms <= 0) return 'Never'
  return new Date(ms).toLocaleString()
}

export default function HarvestManagementFeeSection({ data, canPropose, isConnected }: Props) {
  const { chainId } = useAccount()
  const config = useVaultConfig()
  const { data: resolved } = useResolvedRoleSafes()
  const operatorSafeAddress = getResolvedSafeAddressForRole(config, 'operator', resolved?.resolvedSafes)
  const vaultManagerAddress = getAddress(data.vaultManagerAddress) as `0x${string}`

  const proposeTx = useProposeSafeTransaction(operatorSafeAddress)

  const isWrongChain = isConnected && chainId !== 999
  const feeReceiverIsZero = data.feeReceiver === ZERO_ADDRESS

  function handleProposeSafe() {
    proposeTx.reset()
    const calldata = encodeFunctionData({
      abi: VAULT_MANAGER_ABI,
      functionName: 'harvestManagementFee',
    })
    proposeTx.mutate({ to: vaultManagerAddress, data: calldata })
  }

  // ── Button state ──────────────────────────────────────────────────────────
  let label: string
  let disabled = false
  let btnClass = 'bg-blue-600 text-white hover:bg-blue-700'

  if (!isConnected) {
    label = 'Connect wallet'
    disabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    label = 'Wrong network'
    disabled = true
    btnClass = 'bg-amber-100 text-amber-600 cursor-not-allowed dark:bg-amber-900/30 dark:text-amber-400'
  } else if (!canPropose) {
    label = 'Not permitted'
    disabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    label = 'Confirm in wallet…'
    disabled = true
  } else if (proposeTx.isSuccess) {
    label = '✓ Proposed'
    disabled = true
    btnClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    label = 'Failed — Retry'
    btnClass = 'bg-red-600 text-white hover:bg-red-700'
  } else {
    label = 'Propose via Safe'
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Harvest Management Fee</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          VaultManager.harvestManagementFee()
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
        <div>
          <p className="text-neutral-500 dark:text-neutral-400">Fee rate (annual)</p>
          <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
            {formatTokenAmount(data.managementFeeRate, 16, 2)}%
          </p>
        </div>
        <div>
          <p className="text-neutral-500 dark:text-neutral-400">Last harvest</p>
          <p className="mt-0.5 font-semibold text-neutral-900 dark:text-white">
            {formatTimestamp(data.lastManagementHarvest)}
          </p>
        </div>
        <div>
          <p className="text-neutral-500 dark:text-neutral-400">Fee receiver</p>
          <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
            {feeReceiverIsZero ? (
              <span className="text-yellow-600 dark:text-yellow-400">⚠ not set</span>
            ) : (
              truncateAddress(data.feeReceiver)
            )}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800/50">
        <p className="mb-1 text-neutral-500 dark:text-neutral-400">If harvested now</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <span className="text-neutral-500 dark:text-neutral-400">Fee:</span>{' '}
            <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">
              {formatDenomination(data.managementFeePreview.feeAmount, 2)}
            </span>
          </span>
          <span>
            <span className="text-neutral-500 dark:text-neutral-400">Shares to mint:</span>{' '}
            <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">
              {formatTokenAmount(data.managementFeePreview.sharesToMint, 18, 6)}
            </span>
          </span>
        </div>
      </div>

      {feeReceiverIsZero && (
        <p className="mb-4 rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:border-yellow-700/60 dark:bg-yellow-900/20 dark:text-yellow-400">
          ⚠ Fee receiver is not set — the transaction will revert with{' '}
          <code className="rounded bg-yellow-100 px-1 dark:bg-yellow-900/40">FeeReceiverNotSet()</code>.
          Configure the fee receiver before harvesting.
        </p>
      )}

      <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
        Calling{' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">harvestManagementFee()</code>{' '}
        mints accrued management-fee shares to the fee receiver and recomputes PPS for the new supply. The Safe must hold{' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">OPERATOR_ROLE</code>{' '}
        and you must be one of its owners.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {proposeTx.error && (
          <span
            className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help"
            title={proposeTx.error.message}
          >
            {proposeTx.error.message}
          </span>
        )}

        {proposeTx.isPending && (
          <svg className="h-4 w-4 animate-spin text-neutral-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}

        {proposeTx.isSuccess && (
          <Link href="/safe-transactions" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            View pending →
          </Link>
        )}

        <div className="ml-auto">
          <button
            onClick={handleProposeSafe}
            disabled={disabled}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${btnClass}`}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  )
}
