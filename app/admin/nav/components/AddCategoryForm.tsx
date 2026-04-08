'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { FUND_NAV_FEED_ABI } from '@/lib/abis'
import { FUND_NAV_FEED_ADDRESS } from '@/lib/contracts'
import { useProposeSafeTransaction } from '@/lib/safe/hooks'
import { getSafeAddressForRole } from '@/lib/safe/roles'

type Props = {
  asset: string
  /** True when: Safe has DEFAULT_ADMIN_ROLE AND connected wallet is a Safe owner */
  canPropose: boolean
  isConnected: boolean
  onClose: () => void
}

export default function AddCategoryForm({ asset, canPropose, isConnected, onClose }: Props) {
  const { chainId } = useAccount()
  const [description, setDescription] = useState('')
  const feedAddress = getAddress(FUND_NAV_FEED_ADDRESS) as `0x${string}`
  const assetAddress = getAddress(asset) as `0x${string}`

  const proposeTx = useProposeSafeTransaction(getSafeAddressForRole('admin'))

  const isWrongChain = isConnected && chainId !== 999
  const canSubmit = isConnected && !isWrongChain && canPropose && description.trim().length > 0 && !proposeTx.isPending

  function handleProposeSafe() {
    if (!description.trim()) return
    proposeTx.reset()
    const calldata = encodeFunctionData({
      abi: FUND_NAV_FEED_ABI,
      functionName: 'addNavCategory',
      args: [assetAddress, description.trim()],
    })
    proposeTx.mutate({ to: feedAddress, data: calldata })
  }

  // ── Button state ──────────────────────────────────────────────────────────
  let label: string
  let btnClass = 'bg-blue-600 text-white hover:bg-blue-700'

  if (proposeTx.isPending) {
    label = 'Confirm in wallet…'
    btnClass = 'bg-blue-600 text-white opacity-70 cursor-not-allowed'
  } else if (proposeTx.isSuccess) {
    label = '✓ Proposed'
    btnClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    label = 'Failed — Retry'
    btnClass = 'bg-red-600 text-white hover:bg-red-700'
  } else {
    label = 'Propose via Safe'
  }

  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-neutral-900 dark:text-white">Add NAV Category</h4>
        <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          Cancel
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Category description (e.g. HyperLiquid)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500"
        />
      </div>

      {proposeTx.error && (
        <p className="mb-2 max-w-full truncate text-xs text-red-600 dark:text-red-400" title={proposeTx.error.message}>
          {proposeTx.error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
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
            disabled={!canSubmit && !proposeTx.isError}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${btnClass}`}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  )
}
