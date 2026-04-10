'use client'

import Link from 'next/link'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { VAULT_MANAGER_ABI } from '@/lib/abis'
import { useProposeSafeTransaction } from '@/lib/safe/hooks'
import { getSafeAddressForRole } from '@/lib/safe/roles'
import { useVaultConfig } from '@/lib/vault-context'
import { formatTokenAmount } from '@/lib/format'
import type { NavPageData } from '@/lib/nav-reader'

type Props = {
  data: NavPageData
  /** True when: Safe has OPERATOR_ROLE AND connected wallet is a Safe owner */
  canPropose: boolean
  isConnected: boolean
}

export default function UpdateNavSection({ data, canPropose, isConnected }: Props) {
  const { chainId } = useAccount()
  const config = useVaultConfig()
  const vaultManagerAddress = getAddress(data.vaultManagerAddress) as `0x${string}`

  const proposeTx = useProposeSafeTransaction(getSafeAddressForRole(config, 'operator'))

  const isWrongChain = isConnected && chainId !== 999

  function handleProposeSafe() {
    proposeTx.reset()
    const calldata = encodeFunctionData({
      abi: VAULT_MANAGER_ABI,
      functionName: 'updateNav',
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
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Update NAV</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          VaultManager.updateNav()
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
        <div>
          <p className="text-neutral-500 dark:text-neutral-400">Stored PPS</p>
          <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
            {formatTokenAmount(data.storedPps, 18, 6)}
          </p>
        </div>
        <div>
          <p className="text-neutral-500 dark:text-neutral-400">Live (computed) PPS</p>
          <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
            {formatTokenAmount(data.livePpsValue, 18, 6)}
            {!data.liveIsValidPps && (
              <span className="ml-2 text-xs font-normal text-yellow-600 dark:text-yellow-400">⚠ invalid</span>
            )}
          </p>
        </div>
      </div>

      <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
        Calling{' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">updateNav()</code>{' '}
        recomputes the NAV from all sources and persists the new PPS on-chain. The Safe must hold{' '}
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
