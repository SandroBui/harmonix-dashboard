'use client'

export type StatusFilter = 'all' | 'pending' | 'fulfilled'

export type AssetOption = { assetAddress: string; symbol: string }

type Props = {
  status: StatusFilter
  onStatusChange: (s: StatusFilter) => void
  startDate: string
  endDate: string
  onStartDateChange: (d: string) => void
  onEndDateChange: (d: string) => void
  assetOptions: AssetOption[]
  selectedAssets: Set<string>
  onAssetToggle: (assetAddress: string) => void
  onClear: () => void
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'fulfilled', label: 'Fulfilled' },
]

export default function FilterBar({
  status,
  onStatusChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  assetOptions,
  selectedAssets,
  onAssetToggle,
  onClear,
}: Props) {
  const hasActiveFilter =
    status !== 'all' || startDate !== '' || endDate !== '' || selectedAssets.size > 0

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
      {/* Row 1: status + date range + clear */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onStatusChange(opt.value)}
              className={[
                'rounded px-3 py-1 text-sm font-medium transition-colors',
                status === opt.value
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-500 dark:text-neutral-400">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
          <label className="text-sm text-neutral-500 dark:text-neutral-400">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
        </div>

        {hasActiveFilter && (
          <button
            onClick={onClear}
            className="text-sm text-neutral-400 underline-offset-2 hover:text-neutral-900 hover:underline dark:hover:text-white"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Row 2: asset checkboxes */}
      {assetOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Asset</span>
          {assetOptions.map((opt) => {
            const checked = selectedAssets.has(opt.assetAddress)
            return (
              <label
                key={opt.assetAddress}
                className="flex cursor-pointer items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onAssetToggle(opt.assetAddress)}
                  className="h-3.5 w-3.5 rounded accent-neutral-900 dark:accent-white"
                />
                <span className={checked ? 'font-medium text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}>
                  {opt.symbol}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
