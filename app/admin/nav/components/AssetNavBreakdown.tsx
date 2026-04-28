'use client'

import { useState } from 'react'
import { formatDenomination, formatTokenAmount, truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import type { AssetNavData, NavPageData } from '@/lib/nav-reader'
import CategoryTable, { type Roles } from './CategoryTable'

type Props = { data: NavPageData; roles: Roles }

type CapSeverity = 'none' | 'warn' | 'critical'

type StatItem = {
  label: string
  value: string
  dimmed?: boolean
  highlight?: boolean
  /** Visual emphasis for cap utilization */
  severity?: CapSeverity
}

function AssetStat({ label, value, dimmed, highlight, severity }: StatItem) {
  const sevWrap =
    severity === 'critical'
      ? 'rounded-md bg-red-50 px-2.5 py-1.5 dark:bg-red-900/20'
      : severity === 'warn'
        ? 'rounded-md bg-yellow-50 px-2.5 py-1.5 dark:bg-yellow-900/20'
        : ''
  const sevLabel =
    severity === 'critical'
      ? 'font-medium text-red-600 dark:text-red-400'
      : severity === 'warn'
        ? 'font-medium text-yellow-700 dark:text-yellow-400'
        : ''
  const sevValue =
    severity === 'critical'
      ? 'text-sm text-red-700 dark:text-red-300'
      : severity === 'warn'
        ? 'text-sm text-yellow-800 dark:text-yellow-300'
        : ''

  return (
    <div className={`flex flex-col gap-0.5 ${highlight ? 'rounded-md bg-blue-50 px-2.5 py-1.5 dark:bg-blue-900/20' : sevWrap}`}>
      <span className={`text-xs ${highlight ? 'font-medium text-blue-600 dark:text-blue-400' : sevLabel || 'text-neutral-400 dark:text-neutral-500'}`}>
        {label}
      </span>
      <span className={`tabular-nums font-semibold ${
        highlight
          ? 'text-base text-blue-700 dark:text-blue-300'
          : sevValue
            ? sevValue
            : dimmed
              ? 'text-sm text-neutral-400 dark:text-neutral-500'
              : 'text-sm text-neutral-900 dark:text-white'
      }`}>
        {value}
      </span>
    </div>
  )
}

// ── Cap utilization helpers ──────────────────────────────────────────────────

const WARN_BPS = 8000n      // 80%
const CRITICAL_BPS = 9500n  // 95%
const FULL_BPS = 10000n     // 100%

type CapStatus = {
  severity: CapSeverity
  utilizationBps: bigint | null   // null when uncapped (cap=0)
  utilizationPct: string          // human-readable, e.g. "84.32%" or "—"
}

function computeCapStatus(asset: AssetNavData): CapStatus {
  const cap = BigInt(asset.vaultCap)
  if (cap === 0n) {
    return { severity: 'none', utilizationBps: null, utilizationPct: '—' }
  }
  const stored = BigInt(asset.storedNav)
  const bps = (stored * 10000n) / cap
  let severity: CapSeverity = 'none'
  if (bps >= FULL_BPS) severity = 'critical'
  else if (bps >= CRITICAL_BPS) severity = 'critical'
  else if (bps >= WARN_BPS) severity = 'warn'
  const pct = (Number(bps) / 100).toFixed(2) + '%'
  return { severity, utilizationBps: bps, utilizationPct: pct }
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
          const capStatus = computeCapStatus(assetData)
          const isCapped = assetData.vaultCap !== '0'
          const capDisplay = isCapped
            ? `${formatTokenAmount(assetData.vaultCap, assetData.decimals, 2)} ${assetData.symbol}`
            : 'No limit'
          const capSubLabel = isCapped ? `Stored: ${capStatus.utilizationPct} of cap` : ''

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
            {
              label: capSubLabel ? `Vault Cap · ${capStatus.utilizationPct}` : 'Vault Cap',
              value: capDisplay,
              dimmed: !isCapped,
              severity: capStatus.severity,
            },
          ]

          const containerBorder =
            capStatus.severity === 'critical'
              ? 'border-red-300 dark:border-red-800'
              : capStatus.severity === 'warn'
                ? 'border-yellow-300 dark:border-yellow-800'
                : 'border-neutral-200 dark:border-neutral-700'

          return (
            <div
              key={assetData.asset}
              className={`rounded-lg border bg-white dark:bg-neutral-900 ${containerBorder}`}
            >
              {/* Asset header row — clickable to expand */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleAsset(assetData.asset)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleAsset(assetData.asset)
                  }
                }}
                aria-expanded={isExpanded}
                className="w-full cursor-pointer rounded-lg px-4 py-4 text-left transition-colors hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-neutral-800/50"
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
                    <CopyButton value={assetData.asset} />
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

                {/* Vault cap warning banner — only when capped and approaching/over the limit */}
                {capStatus.severity !== 'none' && (
                  <p className={`mt-3 rounded-md border px-3 py-1.5 text-xs ${
                    capStatus.severity === 'critical'
                      ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                      : 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                  }`}>
                    {capStatus.severity === 'critical'
                      ? `⚠ At or over cap (${capStatus.utilizationPct}) — new deposits will revert with ExceedCap.`
                      : `⚠ Approaching cap (${capStatus.utilizationPct}) — consider raising the cap or notifying operators before further deposits.`}
                  </p>
                )}
              </div>

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
