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

  const cards = [
    {
      label: 'Gross NAV',
      value: formatDenomination(navSnapshot.navDenomination),
      sub: 'Total NAV before redemption deductions',
      warn: false,
    },
    {
      label: 'Effective NAV',
      value: formatDenomination(navSnapshot.effNavDenomination),
      sub: 'Effective NAV value currently managed by the vaults',
      warn: false,
    },
    {
      label: 'Price Per Share',
      value: formatTokenAmount(pricePerShare, 18, 6),
      sub: navSnapshot.isValidPps ? 'PPS is valid' : '⚠ PPS is invalid',
      warn: !navSnapshot.isValidPps,
    },
    {
      label: 'Pending Assets',
      value: formatDenomination(totalPendingDenom.toString()),
      sub: 'Awaiting fulfillment across all vaults',
      warn: false,
    },
    {
      label: 'Claimable Assets',
      value: formatDenomination(totalClaimableDenom.toString()),
      sub: 'Ready to be claimed across all vaults',
      warn: false,
    },
  ]

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
        Fund Overview
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">
              {card.value}
            </p>
            <p
              className={`mt-1 text-xs ${
                card.warn
                  ? 'font-medium text-yellow-700 dark:text-yellow-400'
                  : 'text-neutral-400 dark:text-neutral-500'
              }`}
            >
              {card.sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
