'use client'

import { useMemo, useState } from 'react'
import { useReadContract } from 'wagmi'
import { parseUnits } from 'viem'
import { FUND_CONTRACT_ABI } from '@/lib/abis'
import { useVaultConfig } from '@/lib/vault-context'
import { getFundContractAddress } from '@/lib/nav-contract-targets'
import { formatTokenAmount } from '@/lib/format'

/** On-chain perpDexBalance uses 18-decimal fixed point (WAD). */
const PERP_DEX_BALANCE_DECIMALS = 18

export default function PreviewUpdateNavFields() {
  const config = useVaultConfig()
  const fundContractAddress = getFundContractAddress(config)
  const [perpDexBalanceInput, setPerpDexBalanceInput] = useState('')

  const perpDexBalance = useMemo(() => {
    const trimmed = perpDexBalanceInput.trim()
    if (!trimmed) return undefined
    try {
      return parseUnits(trimmed, PERP_DEX_BALANCE_DECIMALS)
    } catch {
      return undefined
    }
  }, [perpDexBalanceInput])

  const inputInvalid = perpDexBalanceInput.trim() !== '' && perpDexBalance === undefined

  const {
    data: estimatedPps,
    isFetching,
    isError,
    error,
  } = useReadContract({
    address: fundContractAddress,
    abi: FUND_CONTRACT_ABI,
    functionName: 'previewUpdateNAV',
    args: perpDexBalance !== undefined ? [perpDexBalance] : undefined,
    query: { enabled: perpDexBalance !== undefined },
  })

  let estimatedLabel: string
  if (!perpDexBalanceInput.trim()) {
    estimatedLabel = '—'
  } else if (inputInvalid) {
    estimatedLabel = 'Invalid input'
  } else if (isFetching) {
    estimatedLabel = '…'
  } else if (isError) {
    estimatedLabel = 'Error'
  } else if (estimatedPps === undefined) {
    estimatedLabel = '—'
  } else {
    estimatedLabel = formatTokenAmount(estimatedPps.toString(), 18, 6)
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
        <div>
          <label
            htmlFor="perp-dex-balance"
            className="text-neutral-500 dark:text-neutral-400"
          >
            Perp DEX balance
          </label>
          <input
            id="perp-dex-balance"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={perpDexBalanceInput}
            onChange={(e) => setPerpDexBalanceInput(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm tabular-nums text-neutral-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
          {inputInvalid && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Enter a valid number.
            </p>
          )}
        </div>
        <div>
          <p className="text-neutral-500 dark:text-neutral-400">Estimated PPS</p>
          <p
            className="mt-1 font-semibold tabular-nums text-neutral-900 dark:text-white"
            title={isError && error ? error.message : undefined}
          >
            {estimatedLabel}
          </p>
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            via{' '}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
              previewUpdateNAV(perpDexBalance)
            </code>
          </p>
        </div>
      </div>
    </div>
  )
}
