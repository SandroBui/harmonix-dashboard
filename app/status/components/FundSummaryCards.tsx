import type { NavSnapshotData, VaultOverviewData } from '@/lib/status-reader'
import { formatDenomination, formatTokenAmount } from '@/lib/format'

type Props = {
  navSnapshot: NavSnapshotData
  pricePerShare: string
  vaults: VaultOverviewData[]
}

/**
 * Convert a per-vault asset amount to denomination (USD, 1e18) using the
 * vault's stored NAV ratio: denomination = amount * navDenomination / navAsset
 */
function assetsToDenomination(assets: string, navAsset: string, navDenomination: string): bigint {
  const a = BigInt(assets)
  const navA = BigInt(navAsset)
  const navD = BigInt(navDenomination)
  if (a === 0n || navA === 0n) return 0n
  return (a * navD) / navA
}

export default function FundSummaryCards({ navSnapshot, pricePerShare, vaults }: Props) {
  // Sum pending and claimable across all vaults, converted to denomination (USD)
  const totalPendingDenom = vaults.reduce(
    (sum, v) => sum + assetsToDenomination(v.pendingAssets, v.navAsset, v.navDenomination),
    0n,
  )
  const totalClaimableDenom = vaults.reduce(
    (sum, v) => sum + assetsToDenomination(v.claimableAssets, v.navAsset, v.navDenomination),
    0n,
  )

  const cards: { label: string; value: React.ReactNode; sub: React.ReactNode | null; warn: boolean }[] = [
    {
      label: 'NAV',
      value: (
        <div className="flex items-baseline gap-4">
          <div>
            {formatDenomination(navSnapshot.effNavDenomination)}
            <div className="text-xs font-normal text-neutral-400">Effective</div>
          </div>
          <div className="text-neutral-300 dark:text-neutral-600">·</div>
          <div className="text-neutral-700 dark:text-neutral-200">
            {formatDenomination(navSnapshot.navDenomination)}
            <div className="text-xs font-normal text-neutral-400">Gross</div>
          </div>
        </div>
      ),
      sub: null,
      warn: false,
    },
    {
      label: 'Price Per Share',
      value: (
        <>
          {formatTokenAmount(pricePerShare, 18, 6)}
          <span className="ml-1 text-sm font-normal text-neutral-400">USDC / share</span>
          {navSnapshot.isValidPps && (
            <svg
              className="ml-1.5 inline-block align-[-2px] text-green-500"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="PPS valid"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </>
      ),
      sub: navSnapshot.isValidPps ? 'PPS is valid' : '⚠ PPS is invalid',
      warn: !navSnapshot.isValidPps,
    },
    {
      label: 'Withdrawal Assets',
      value: (
        <div className="flex items-baseline gap-4">
          <div>
            {formatDenomination(totalPendingDenom.toString())}
            <div className="text-xs font-normal text-neutral-400">Pending</div>
          </div>
          <div className="text-neutral-300 dark:text-neutral-600">·</div>
          <div className="text-neutral-700 dark:text-neutral-200">
            {formatDenomination(totalClaimableDenom.toString())}
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
        Fund Overview
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border p-4 transition-all duration-150 cursor-default ${
              card.warn
                ? 'border-yellow-200 bg-yellow-50 hover:border-yellow-400 hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-900/20 dark:hover:border-yellow-600 dark:hover:bg-yellow-900/40'
                : 'border-neutral-200 bg-white hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800'
            }`}
          >
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{card.label}</p>
            <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">
              {card.value}
            </div>
            {card.sub !== null && (
              <p
                className={`mt-1 text-xs ${
                  card.warn
                    ? 'font-medium text-yellow-700 dark:text-yellow-400'
                    : 'text-neutral-400 dark:text-neutral-500'
                }`}
              >
                {card.sub}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
