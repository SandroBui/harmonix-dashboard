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

  const cards: {
    label: string
    value: React.ReactNode
    sub: React.ReactNode | null
    warn: boolean
  }[] = [
    // ── PPS (Live primary, Stored secondary) ────────────────────────────────
    {
      label: 'Price Per Share',
      value: (
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <span>{formatTokenAmount(data.livePpsValue, 18, 6)}</span>
              <Tip text={data.liveIsValidPps ? 'PPS is valid — deviation within bounds' : 'PPS is invalid — deviation exceeds threshold'}>
                {data.liveIsValidPps ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                  </span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </span>
                )}
              </Tip>
            </div>
            <div className="text-xs font-normal text-neutral-400">Live</div>
          </div>
          <div className="text-right text-neutral-700 dark:text-neutral-200">
            {formatTokenAmount(data.storedPps, 18, 6)}
            <div className="text-xs font-normal text-neutral-400">Stored</div>
          </div>
        </div>
      ),
      sub: delta ? (
        <span>
          <span className={delta.positive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
            {delta.pct}
          </span>{' '}
          vs stored ·{' '}
          <span className="text-neutral-500 dark:text-neutral-400">
            <LastUpdated lastNavUpdated={data.lastNavUpdated} />
          </span>
        </span>
      ) : (
        <LastUpdated lastNavUpdated={data.lastNavUpdated} />
      ),
      warn: !data.liveIsValidPps,
    },
    // ── NAV (Effective primary, Gross secondary) ────────────────────────────
    {
      label: 'NAV',
      value: (
        <div className="flex items-baseline justify-between gap-4">
          <div>
            {formatDenomination(data.liveEffNavDenomination)}
            <div className="text-xs font-normal text-neutral-400">Effective</div>
          </div>
          <div className="text-right text-neutral-700 dark:text-neutral-200">
            {formatDenomination(data.liveNavDenomination)}
            <div className="text-xs font-normal text-neutral-400">Gross</div>
          </div>
        </div>
      ),
      sub: null,
      warn: false,
    },
    // ── Withdrawal NAV (Pending primary, Claimable secondary) ───────────────
    {
      label: 'Withdrawal NAV',
      value: (
        <div className="flex items-baseline justify-between gap-4">
          <div>
            {formatDenomination(data.totalPendingNav)}
            <div className="text-xs font-normal text-neutral-400">Pending</div>
          </div>
          <div className="text-right text-neutral-700 dark:text-neutral-200">
            {formatDenomination(data.totalClaimableNav)}
            <div className="text-xs font-normal text-neutral-400">Claimable</div>
          </div>
        </div>
      ),
      sub: 'Across all vaults',
      warn: false,
    },
  ]

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
        NAV Overview
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">
              {card.value}
            </div>
            <div className={`mt-1 text-xs ${card.warn ? 'font-medium text-yellow-700 dark:text-yellow-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
