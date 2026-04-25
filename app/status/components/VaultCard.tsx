import type { VaultOverviewData } from '@/lib/status-reader'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import CapitalDonut from './CapitalDonut'

type Props = { vault: VaultOverviewData }

export default function VaultCard({ vault }: Props) {
  const d = vault.decimals
  const idle = BigInt(vault.idleAssets)
  const pending = BigInt(vault.pendingAssets)
  const claimable = BigInt(vault.claimableAssets)
  const fundNav = BigInt(vault.fundNavBalance)
  const redeemShares = BigInt(vault.redeemShares)

  const hasRedemptions = pending > 0n || claimable > 0n || redeemShares > 0n

  return (
    <div
      className={`rounded-lg border p-5 ${
        vault.isPaused
          ? 'border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-900/10'
          : 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900'
      }`}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
            {vault.symbol} Vault
          </h3>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300">
            <span>{truncateAddress(vault.vault)}</span>
            <CopyButton
              value={vault.vault}
              className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            />
            <a
              href={`https://hyperevmscan.io/address/${vault.vault}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View on HyperEVMScan"
              className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
        {vault.isPaused ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            ⏸ Paused
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            ● Active
          </span>
        )}
      </div>

      {/* ── Capital Distribution + NAV ───────────────────────────────────── */}
      <div className="mb-4">
        <p className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Capital Distribution
        </p>
        <div className="flex items-center gap-8">
          <CapitalDonut
            idle={idle}
            claimable={claimable}
            pending={pending}
            fundNav={fundNav}
            size={180}
            strokeWidth={26}
            centerPrimary={`${formatTokenAmount(vault.navAsset, d, 2)} ${vault.symbol}`}
            centerSecondary={`≈ $${formatTokenAmount(vault.navDenomination, 18, 2)}`}
          />
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { label: 'Idle', value: idle, dot: 'bg-emerald-500' },
              { label: 'Claimable', value: claimable, dot: 'bg-blue-500' },
              { label: 'Pending', value: pending, dot: 'bg-yellow-400' },
              { label: 'Fund NAV', value: fundNav, dot: 'bg-violet-500' },
            ].map((row) => {
              const isZero = row.value === 0n
              return (
                <div
                  key={row.label}
                  className={`flex items-center gap-2 rounded-md border border-neutral-100 px-2.5 py-1.5 dark:border-neutral-800 ${
                    isZero ? 'opacity-40' : ''
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {row.label}
                  </span>
                  <span className="ml-auto truncate text-xs font-semibold tabular-nums text-neutral-900 dark:text-white">
                    {formatTokenAmount(row.value.toString(), d, 4)}
                    <span className="ml-1 text-[11px] font-normal text-neutral-400">
                      {vault.symbol}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Per-strategy breakdown */}
        {vault.strategies.length > 0 && (
          <div className="mt-3 space-y-1 rounded-md border border-neutral-100 p-2 dark:border-neutral-800">
            <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500">
              Strategies ({vault.strategies.length})
            </p>
            {vault.strategies.map((s) => (
              <div
                key={s.address}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-mono text-neutral-400 dark:text-neutral-500">
                  {truncateAddress(s.address)}
                  <CopyButton value={s.address} />
                </span>
                <span className="tabular-nums text-neutral-700 dark:text-neutral-300">
                  {formatTokenAmount(s.allocated, d, 4)} {vault.symbol}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Redemption State ─────────────────────────────────────────────── */}
      {hasRedemptions && (
        <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Redemptions
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Pending</p>
              <p className="mt-0.5 font-semibold tabular-nums text-yellow-600 dark:text-yellow-400">
                {formatTokenAmount(vault.pendingAssets, d, 4)}
                <span className="ml-1 text-xs font-normal opacity-70">{vault.symbol}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Claimable</p>
              <p className="mt-0.5 font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {formatTokenAmount(vault.claimableAssets, d, 4)}
                <span className="ml-1 text-xs font-normal opacity-70">{vault.symbol}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Locked Shares</p>
              <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
                {formatTokenAmount(vault.redeemShares, 18, 4)}
              </p>
            </div>
          </div>
        </div>
      )}

      {!hasRedemptions && (
        <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            No pending redemptions
          </p>
        </div>
      )}
    </div>
  )
}
