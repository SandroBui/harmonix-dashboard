'use client'

import { useState } from 'react'
import { formatDenomination, truncateAddress } from '@/lib/format'
import type { NavPageData } from '@/lib/nav-reader'
import CategoryTable, { type Roles } from './CategoryTable'

type Props = { data: NavPageData; roles: Roles }

type StatItem = { label: string; value: string; dimmed?: boolean; highlight?: boolean }

function AssetStat({ label, value, dimmed, highlight }: StatItem) {
  return (
    <div className={`flex flex-col gap-0.5 ${highlight ? 'rounded-md bg-blue-50 px-2.5 py-1.5 dark:bg-blue-900/20' : ''}`}>
      <span className={`text-xs ${highlight ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
        {label}
      </span>
      <span className={`tabular-nums font-semibold ${
        highlight
          ? 'text-base text-blue-700 dark:text-blue-300'
          : dimmed
            ? 'text-sm text-neutral-400 dark:text-neutral-500'
            : 'text-sm text-neutral-900 dark:text-white'
      }`}>
        {value}
      </span>
    </div>
  )
}

export default function AssetNavBreakdown({ data, roles }: Props) {
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set())

  function toggleAsset(asset: string) {
    setExpandedAssets((prev) => {
      const next = new Set(prev)
      if (next.has(asset)) next.delete(asset)
      else next.add(asset)
      return next
    })
  }

  if (data.assets.length === 0) {
    return (
      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
          Per-Asset NAV Breakdown
        </h2>
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-400">No registered assets found.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
        Per-Asset NAV Breakdown
      </h2>
      <div className="space-y-2">
        {data.assets.map((assetData) => {
          const isExpanded = expandedAssets.has(assetData.asset)

          const stats: StatItem[] = [
            {
              label: 'Effective NAV',
              value: formatDenomination(assetData.effectiveDenomination),
              highlight: true,
            },
            {
              label: 'Stored NAV',
              value: formatDenomination(assetData.storedDenomination),
            },
            {
              label: 'Off-chain NAV',
              value: formatDenomination(assetData.offChainDenomination),
            },
            {
              label: 'Claimable',
              value: formatDenomination(assetData.claimableDenomination),
              dimmed: assetData.claimableDenomination === '0',
            },
            {
              label: 'Pending',
              value: formatDenomination(assetData.pendingDenomination),
              dimmed: assetData.pendingDenomination === '0',
            },
          ]

          return (
            <div
              key={assetData.asset}
              className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
            >
              {/* Asset header row — clickable to expand */}
              <button
                onClick={() => toggleAsset(assetData.asset)}
                className="w-full rounded-lg px-4 py-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">

                  {/* Symbol + address */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {assetData.symbol}
                    </span>
                    <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">
                      {truncateAddress(assetData.asset)}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {assetData.categories.length} {assetData.categories.length === 1 ? 'category' : 'categories'}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="hidden sm:block h-6 w-px bg-neutral-200 dark:bg-neutral-700 shrink-0" />

                  {/* Stats grid */}
                  <div className="flex items-start gap-6 flex-wrap">
                    {stats.map((s) => (
                      <AssetStat key={s.label} {...s} />
                    ))}
                  </div>

                  {/* Expand chevron */}
                  <span className="ml-auto shrink-0 text-neutral-400 dark:text-neutral-500">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
              </button>

              {/* Expanded category table */}
              {isExpanded && (
                <div className="border-t border-neutral-100 px-4 pb-4 dark:border-neutral-800">
                  <CategoryTable
                    asset={assetData.asset}
                    symbol={assetData.symbol}
                    decimals={assetData.decimals}
                    categories={assetData.categories}
                    roles={roles}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
