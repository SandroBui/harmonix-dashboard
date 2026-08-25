import type { FundStatusV2Data } from '@/lib/status-v2-reader'
import { formatDenomination, formatTokenAmount, truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'

type Props = {
  status: FundStatusV2Data | null
  isLoading?: boolean
  isRefreshing?: boolean
}

const CARD_LABELS = [
  'Chain',
  'Deposit Asset',
  'NAV',
  'Price Per Share',
  'Withdraw Pool',
  'Total Supply',
]

function SkeletonCard({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{label}</p>
      <div className="mt-2 h-7 w-2/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
    </div>
  )
}

export default function VaultStatusV2Cards({
  status,
  isLoading = false,
  isRefreshing = false,
}: Props) {
  if (isLoading) {
    return (
      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">Vault Status</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARD_LABELS.map((label) => (
            <SkeletonCard key={label} label={label} />
          ))}
        </div>
      </div>
    )
  }

  if (!status) {
    return (
      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">Vault Status</h2>
        <p className="text-sm text-neutral-400 dark:text-neutral-500">No status data available.</p>
      </div>
    )
  }

  const cards: {
    label: string
    value: React.ReactNode
    sub: React.ReactNode | null
  }[] = [
    {
      label: 'Chain',
      value: status.chainName,
      sub: `Chain ID ${status.chainId}`,
    },
    {
      label: 'Deposit Asset',
      value: status.underlyingSymbol,
      sub: (
        <span className="inline-flex items-center gap-1 font-mono">
          {truncateAddress(status.depositAssetAddress)}
          <CopyButton value={status.depositAssetAddress} />
        </span>
      ),
    },
    {
      label: 'NAV',
      value: formatDenomination(status.nav),
      sub: 'From FundContractReader',
    },
    {
      label: 'Price Per Share',
      value: (
        <>
          {formatTokenAmount(status.pricePerShare, 18, 6)}
          <span className="ml-1 text-sm font-normal text-neutral-400">
            {status.underlyingSymbol} / share
          </span>
        </>
      ),
      sub: 'From FundContractReader',
    },
    {
      label: 'Withdraw Pool',
      value: (
        <>
          {formatTokenAmount(status.withdrawPoolAmount, status.underlyingDecimals, 4)}
          <span className="ml-1 text-sm font-normal text-neutral-400">{status.underlyingSymbol}</span>
        </>
      ),
      sub: 'From FundContractReader',
    },
    {
      label: 'Total Supply',
      value: formatTokenAmount(status.totalSupply, 18, 4),
      sub: 'From FundContract',
    },
  ]

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Vault Status</h2>
        {isRefreshing && (
          <span className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Updating…
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-neutral-200 bg-white p-4 transition-all duration-150 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
          >
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{card.label}</p>
            <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">
              {card.value}
            </div>
            {card.sub !== null && (
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{card.sub}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
