'use client'

import { useState } from 'react'
import { ROLE_LABELS } from '@/lib/safe/roles'
import type { RoleType } from '@/lib/safe/roles'
import type { SafeInfo } from '@/lib/safe/types'
import { ASSET_METADATA } from '@/lib/contracts'
import type { RoleTaggedTx } from './SafeTxClient'
import SafeTxDetail from './SafeTxDetail'

type Props = {
  transactions: RoleTaggedTx[]
  vaultAssetMap: Record<string, string>
}

function isRejectionTx(tx: RoleTaggedTx): boolean {
  const hasEmptyData = !tx.data || tx.data === '0x'
  const toSelf = tx.to.toLowerCase() === tx.safeAddress.toLowerCase()
  return hasEmptyData && toSelf
}

const ROLE_BADGE_COLORS: Record<RoleType, string> = {
  operator:           'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  curator:            'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  price_updater:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  timelock_proposer:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  admin:              'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function SafeMetaBadge({ safeAddress, safeInfo }: { safeAddress: string; safeInfo: SafeInfo | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
      {truncateAddress(safeAddress)}
      {safeInfo && (
        <span className="text-neutral-400 dark:text-neutral-500">
          {' '}· {safeInfo.threshold}/{safeInfo.owners.length}
        </span>
      )}
    </span>
  )
}

export default function SafeTxList({ transactions, vaultAssetMap }: Props) {
  const [expandedHash, setExpandedHash] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {transactions.map((tx) => {
        const isExpanded = expandedHash === tx.safeTxHash
        const isRejection = isRejectionTx(tx)

        // Resolve asset symbol for fulfillRedeem rows
        const fulfillTokenAddr = tx.dataDecoded?.method === 'fulfillRedeem'
          ? vaultAssetMap[tx.to.toLowerCase()]
          : undefined
        const fulfillAsset = fulfillTokenAddr ? ASSET_METADATA[fulfillTokenAddr] : undefined

        return (
          <div
            key={tx.safeTxHash}
            className={`overflow-hidden rounded-lg border bg-white dark:bg-neutral-900 ${
              isRejection
                ? 'border-red-200 dark:border-red-900'
                : 'border-neutral-200 dark:border-neutral-700'
            }`}
          >
            {/* Summary row */}
            <button
              onClick={() => setExpandedHash(isExpanded ? null : tx.safeTxHash)}
              className="flex w-full items-center gap-4 px-5 py-5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              {/* Nonce badge */}
              <span className="shrink-0 rounded-md bg-neutral-100 px-2.5 py-1 font-mono text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                #{tx.nonce}
              </span>

              {/* Main content */}
              <div className="flex-1 min-w-0 space-y-2">
                {/* Summary text */}
                {isRejection ? (
                  <p className="truncate text-base font-semibold text-red-600 dark:text-red-400">
                    🚫 Cancellation of tx #{tx.nonce}
                  </p>
                ) : (
                  <p className="truncate text-base font-semibold text-neutral-900 dark:text-white">
                    {tx.summary}
                  </p>
                )}

                {/* Role badge(s) + asset chip (if fulfillRedeem) + Safe meta */}
                <div className="flex flex-wrap items-center gap-2">
                  {tx.roles.map((role) => (
                    <span
                      key={role}
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${ROLE_BADGE_COLORS[role]}`}
                    >
                      {ROLE_LABELS[role]}
                    </span>
                  ))}
                  {fulfillAsset && (
                    <span className="inline-flex items-center rounded-md bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                      {fulfillAsset.symbol}
                    </span>
                  )}
                  <SafeMetaBadge safeAddress={tx.safeAddress} safeInfo={tx.safeInfo} />
                </div>
              </div>

              {/* Confirmation progress */}
              <span
                className={`shrink-0 text-sm font-semibold ${
                  tx.isExecutable
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {tx.confirmationsCount}/{tx.confirmationsRequired}
                {tx.isExecutable ? ' ✓ Ready' : ' signed'}
              </span>

              {/* Chevron */}
              <svg
                className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <SafeTxDetail tx={tx} safeInfo={tx.safeInfo} safeAddress={tx.safeAddress} />
            )}
          </div>
        )
      })}
    </div>
  )
}
