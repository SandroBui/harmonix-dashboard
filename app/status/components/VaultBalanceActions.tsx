'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { encodeFunctionData, getAddress } from 'viem'
import { VAULT_ASSET_ABI } from '@/lib/contracts'
import { useProposeSafeTransaction } from '@/lib/safe/hooks'
import { formatTokenAmount } from '@/lib/format'

// TODO: pair this with a syncBalanceOf admin form (operator-only WAD-denom write on
// VaultManager) — that's the v0.6.0-correct way to reconcile the booked vs live balance
// drift that the old fulfillRedeem(amount, []) "top up" trick used to paper over.

type Props = {
  vault: string
  vaultAssetBalance: string // raw bigint string
  decimals: number
  symbol: string
}

/** Parse a human-readable decimal string into a raw bigint (e.g. "1.5" + 6 decimals → 1_500_000n) */
function parseDecimalInput(input: string, decimals: number): bigint | null {
  if (!input || input.trim() === '') return null
  const clean = input.trim().replace(/,/g, '')
  const parts = clean.split('.')
  if (parts.length > 2) return null
  const whole = parts[0] === '' ? '0' : parts[0]
  const frac = (parts[1] ?? '').slice(0, decimals).padEnd(decimals, '0')
  try {
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac)
  } catch {
    return null
  }
}

export default function VaultBalanceActions({
  vault,
  vaultAssetBalance,
  decimals,
  symbol,
}: Props) {
  const balance = BigInt(vaultAssetBalance)

  const [isOpen, setIsOpen] = useState(false)
  const [amountInput, setAmountInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  const proposeTx = useProposeSafeTransaction()
  const isBusy = proposeTx.isPending

  // Auto-close panel 3 s after a successful proposal
  useEffect(() => {
    if (proposeTx.isSuccess) {
      const t = setTimeout(() => {
        proposeTx.reset()
        setIsOpen(false)
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [proposeTx.isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  function openPanel() {
    if (isBusy) return
    if (isOpen) {
      setIsOpen(false)
      return
    }
    proposeTx.reset()
    setInputError(null)
    setIsOpen(true)
    setAmountInput(
      balance > 0n ? formatTokenAmount(balance.toString(), decimals, decimals) : '',
    )
  }

  function handleSubmit() {
    setInputError(null)
    const raw = parseDecimalInput(amountInput, decimals)
    if (!raw || raw <= 0n) {
      setInputError('Enter a valid amount greater than 0')
      return
    }
    const vaultAddr = getAddress(vault) as `0x${string}`
    proposeTx.reset()
    const data = encodeFunctionData({
      abi: VAULT_ASSET_ABI,
      functionName: 'sweep',
      args: [raw],
    })
    proposeTx.mutate({ to: vaultAddr, data })
  }

  const sweepWarningMsg =
    balance > 0n
      ? `Vault holds ${formatTokenAmount(balance.toString(), decimals, decimals)} ${symbol}. Sweep returns it to FundVault — emergency-recovery only (donations / rounding residue).`
      : 'No idle balance to sweep.'

  const btnBase = 'rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap'

  function sweepBtnClass() {
    if (isOpen && proposeTx.isSuccess)
      return 'bg-green-100 text-green-700 cursor-not-allowed dark:bg-green-900/30 dark:text-green-400'
    if (balance > 0n)
      return 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
    return 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {balance > 0n && (
            <span className="group/warn relative inline-flex cursor-help shrink-0 text-amber-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 1 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 w-72 -translate-y-1/2 rounded-md bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/warn:opacity-100 dark:bg-neutral-700">
                {sweepWarningMsg}
                <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-neutral-900 dark:border-l-neutral-700" />
              </span>
            </span>
          )}
          <button
            onClick={openPanel}
            disabled={isBusy || (isOpen && proposeTx.isSuccess)}
            className={`${btnBase} ${sweepBtnClass()}`}
          >
            {isOpen && proposeTx.isSuccess ? '✓ Proposed' : 'Sweep'}
            {!isBusy && !(isOpen && proposeTx.isSuccess) && (
              <span className="ml-1 opacity-60">{isOpen ? '▲' : '▼'}</span>
            )}
          </button>
        </div>
      </div>

      {isOpen && !proposeTx.isSuccess && (
        <div className="w-full min-w-[220px] rounded-md border border-neutral-200 bg-white p-2.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Amount to sweep
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value)
                setInputError(null)
              }}
              disabled={isBusy}
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs tabular-nums text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
              placeholder="0.0"
            />
            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
              {symbol}
            </span>
          </div>

          {inputError && (
            <p className="mt-1 text-xs text-red-500">{inputError}</p>
          )}

          {proposeTx.isError && (
            <p
              className="mt-1 max-w-[200px] truncate text-xs text-red-500 cursor-help"
              title={proposeTx.error?.message}
            >
              {proposeTx.error?.message}
            </p>
          )}

          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleSubmit}
              disabled={isBusy}
              className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 bg-amber-600 text-white hover:bg-amber-700 disabled:hover:bg-amber-600"
            >
              {proposeTx.isPending ? 'Confirm in wallet…' : 'Propose Sweep'}
            </button>

            {!isBusy && (
              <button
                onClick={() => setIsOpen(false)}
                className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                Cancel
              </button>
            )}

            {isBusy && (
              <svg
                className="h-3.5 w-3.5 animate-spin text-neutral-400"
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
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {proposeTx.isSuccess && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-green-600 dark:text-green-400">✓ Proposed to Safe</span>
          <Link
            href="/safe-transactions"
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            View →
          </Link>
        </div>
      )}
    </div>
  )
}
