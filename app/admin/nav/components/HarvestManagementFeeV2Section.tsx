'use client'

import Link from 'next/link'
import { formatDenomination, formatTokenAmount, formatV2FeeRatePercent, truncateAddress } from '@/lib/format'
import type { NavPageData } from '@/lib/nav-reader'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const WAD = 10n ** 18n

function formatTimestamp(seconds: string): string {
  if (seconds === '0') return 'Never'
  const ms = Number(seconds) * 1_000
  if (!Number.isFinite(ms) || ms <= 0) return 'Never'
  return new Date(ms).toLocaleString()
}

function computePostMintPps(
  effNavDenomination: string,
  effectiveSupply: string,
  sharesToMint: string,
): string | null {
  const newEffSupply = BigInt(effectiveSupply) + BigInt(sharesToMint)
  if (newEffSupply === 0n) return null
  return ((BigInt(effNavDenomination) * WAD) / newEffSupply).toString()
}

type ActionProps = {
  label: string
  disabled: boolean
  btnClass: string
  onClick: () => void
  pending: boolean
  error?: string
  success: boolean
  successLink?: { href: string; text: string }
}

type Props = {
  data: NavPageData
  stepNumber: number
  action: ActionProps
}

export default function HarvestManagementFeeV2Section({ data, stepNumber, action }: Props) {
  const feeReceiver = data.managementFeeReceiver ?? data.feeReceiver
  const feeReceiverIsZero = feeReceiver === ZERO_ADDRESS

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {stepNumber}
        </span>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Harvest Management Fee</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          FundContract.harvestManagementFee()
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-neutral-500 dark:text-neutral-400">Fee rate (annual)</p>
          <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
            {formatV2FeeRatePercent(data.managementFeeRate)}
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
              truncateAddress(feeReceiver)
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
              {formatDenomination(data.managementFeePreview.feeAmount, 6)}
            </span>
          </span>
          <span>
            <span className="text-neutral-500 dark:text-neutral-400">Shares to mint:</span>{' '}
            <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">
              {formatTokenAmount(data.managementFeePreview.sharesToMint, 18, 6)}
            </span>
          </span>
          <span>
            <span className="text-neutral-500 dark:text-neutral-400">PPS after harvest:</span>{' '}
            <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">
              {(() => {
                const newPps = computePostMintPps(
                  data.liveEffNavDenomination,
                  data.effectiveSupply,
                  data.managementFeePreview.sharesToMint,
                )
                return newPps === null ? '—' : formatTokenAmount(newPps, 18, 6)
              })()}
            </span>
          </span>
        </div>
      </div>

      {feeReceiverIsZero && (
        <p className="mb-4 rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:border-yellow-700/60 dark:bg-yellow-900/20 dark:text-yellow-400">
          ⚠ Fee receiver is not set — the transaction may revert. Configure the management fee
          receiver before harvesting.
        </p>
      )}

      <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
        Mints accrued management-fee shares to the fee receiver. Requires{' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ADMIN</code> on the fund
        contract (EOA or Safe proposal via Execute as above).
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {action.error && (
          <span
            className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help"
            title={action.error}
          >
            {action.error}
          </span>
        )}
        {action.pending && (
          <svg
            className="h-4 w-4 animate-spin text-neutral-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
        {action.success && action.successLink && (
          <Link
            href={action.successLink.href}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {action.successLink.text}
          </Link>
        )}
        <div className="ml-auto">
          <button
            onClick={action.onClick}
            disabled={action.disabled}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${action.btnClass}`}
          >
            {action.label}
          </button>
        </div>
      </div>
    </div>
  )
}
