'use client'

import { useState, useEffect } from 'react'
import { formatTokenAmount, formatDenomination } from '@/lib/format'
import type { NavPageData } from '@/lib/nav-reader'

type Props = { data: NavPageData }

function ppsDelta(live: string, stored: string): { pct: string; positive: boolean } | null {
  const l = BigInt(live)
  const s = BigInt(stored)
  if (s === 0n) return null
  const diff = l - s
  const pct = Number((diff * 10000n) / s) / 100
  return { pct: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, positive: pct >= 0 }
}

// Renders only after mount to avoid SSR/client toLocaleString() mismatch.
function LastUpdated({ lastNavUpdated }: { lastNavUpdated: string }) {
  const [label, setLabel] = useState<string>('—')
  useEffect(() => {
    setLabel(
      lastNavUpdated === '0'
        ? 'Never'
        : `Last updated: ${new Date(Number(lastNavUpdated) * 1000).toLocaleString()}`,
    )
  }, [lastNavUpdated])
  return <>{label}</>
}

// Pure-CSS tooltip — no JS needed.
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-neutral-700 dark:ring-1 dark:ring-neutral-600">
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-700" />
      </span>
    </span>
  )
}

export default function NavSummaryCards({ data }: Props) {
  const delta = ppsDelta(data.livePpsValue, data.storedPps)

  const cards = [
    // ── Stored PPS ──────────────────────────────────────────────────────────
    {
      label: 'Stored PPS',
      value: formatTokenAmount(data.storedPps, 18, 6),
      sub: <LastUpdated lastNavUpdated={data.lastNavUpdated} />,
      warn: false,
      badge: null,
    },
    // ── Live PPS — validity badge inline ────────────────────────────────────
    {
      label: 'Live PPS',
      value: (
        <span className="flex items-center gap-1.5">
          {formatTokenAmount(data.livePpsValue, 18, 6)}
          <Tip text={data.liveIsValidPps ? 'PPS is valid — deviation within bounds' : 'PPS is invalid — deviation exceeds threshold'}>
            {data.liveIsValidPps ? (
              // ✓ tick
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                </svg>
              </span>
            ) : (
              // ✗ cross
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </span>
            )}
          </Tip>
        </span>
      ),
      sub: delta ? (
        <span className={delta.positive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
          {delta.pct} vs stored
        </span>
      ) : 'vs stored PPS',
      warn: !data.liveIsValidPps,
      badge: null,
    },
    // ── Gross NAV ───────────────────────────────────────────────────────────
    {
      label: 'Gross NAV',
      value: formatDenomination(data.liveNavDenomination),
      sub: 'Total live NAV (denomination)',
      warn: false,
      badge: null,
    },
    // ── Effective NAV ───────────────────────────────────────────────────────
    {
      label: 'Effective NAV',
      value: formatDenomination(data.liveEffNavDenomination),
      sub: 'After pending redemption deductions',
      warn: false,
      badge: null,
    },
    // ── Claimable NAV ───────────────────────────────────────────────────────
    {
      label: 'Claimable NAV',
      value: formatDenomination(data.totalClaimableNav),
      sub: 'Assets ready to be claimed across all vaults',
      warn: false,
      badge: null,
    },
    // ── Pending NAV ─────────────────────────────────────────────────────────
    {
      label: 'Pending NAV',
      value: formatDenomination(data.totalPendingNav),
      sub: 'Assets awaiting fulfillment across all vaults',
      warn: false,
      badge: null,
    },
  ]

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
        NAV Overview
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border p-4 transition-all duration-150 cursor-default ${
              card.warn
                ? 'border-yellow-200 bg-yellow-50 hover:border-yellow-400 dark:border-yellow-800 dark:bg-yellow-900/20 dark:hover:border-yellow-600'
                : 'border-neutral-200 bg-white hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800'
            }`}
          >
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{card.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">
              {card.value}
            </p>
            <p className={`mt-1 text-xs ${card.warn ? 'font-medium text-yellow-700 dark:text-yellow-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
              {card.sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
