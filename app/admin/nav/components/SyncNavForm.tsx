'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress, parseUnits } from 'viem'
import { FUND_NAV_FEED_ABI } from '@/lib/abis'
import { useProposeSafeTransaction } from '@/lib/safe/hooks'
import { getSafeAddressForRole } from '@/lib/safe/roles'
import { useVaultConfig } from '@/lib/vault-context'
import { useFundNavFeedAddress } from '@/lib/hooks/use-fund-nav-feed'
import { formatTokenAmount } from '@/lib/format'
import type { NavCategoryData } from '@/lib/nav-reader'

type Props = {
  asset: string
  decimals: number
  symbol: string
  category: NavCategoryData
  /** True when: Safe has OPERATOR_ROLE AND connected wallet is a Safe owner */
  canPropose: boolean
  isConnected: boolean
  onClose: () => void
}

export default function SyncNavForm({ asset, decimals, symbol, category, canPropose, isConnected, onClose }: Props) {
  const { chainId } = useAccount()
  const [inputValue, setInputValue] = useState('')
  const config = useVaultConfig()
  const feedAddress = useFundNavFeedAddress()
  const assetAddress = getAddress(asset) as `0x${string}`

  const proposeTx = useProposeSafeTransaction(getSafeAddressForRole(config, 'operator'))

  const isWrongChain = isConnected && chainId !== 999

  function parseNavInput(): bigint | null {
    try {
      if (!inputValue.trim()) return null
      return parseUnits(inputValue.trim(), decimals)
    } catch {
      return null
    }
  }

  function handleProposeSafe() {
    const navRaw = parseNavInput()
    if (navRaw === null || !feedAddress) return
    proposeTx.reset()
    const calldata = encodeFunctionData({
      abi: FUND_NAV_FEED_ABI,
      functionName: 'syncNavValue',
      args: [assetAddress, category.description, navRaw],
    })
    proposeTx.mutate({ to: getAddress(feedAddress) as `0x${string}`, data: calldata })
  }

  const navRaw = parseNavInput()
  const isInputValid = navRaw !== null
  const canSubmit = isConnected && !isWrongChain && canPropose && isInputValid && !proposeTx.isPending && Boolean(feedAddress)

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
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200">
          Sync NAV — <span className="font-mono">{category.description}</span>
        </h4>
        <button onClick={onClose} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
          Cancel
        </button>
      </div>

      <div className="mb-3 text-xs text-blue-700 dark:text-blue-300">
        Current value:{' '}
        <span className="font-semibold tabular-nums">
          {formatTokenAmount(category.nav, decimals, 4)} {symbol}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="any"
          placeholder={`New NAV in ${symbol}`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="flex-1 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-700 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500"
        />
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{symbol}</span>
      </div>

      {proposeTx.error && (
        <p className="mb-2 max-w-full truncate text-xs text-red-600 dark:text-red-400" title={proposeTx.error.message}>
          {proposeTx.error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {proposeTx.isPending && (
          <svg className="h-4 w-4 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
