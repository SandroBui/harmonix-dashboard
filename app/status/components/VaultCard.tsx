import type { VaultOverviewData } from '@/lib/status-reader'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import CapitalBreakdownBar from './CapitalBreakdownBar'

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
          <p className="mt-0.5 font-mono text-xs text-neutral-400 dark:text-neutral-500">
            {truncateAddress(vault.vault)}
          </p>
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

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">NAV (asset)</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900 dark:text-white">
            {formatTokenAmount(vault.navAsset, d, 2)}{' '}
            <span className="text-sm font-normal text-neutral-400">{vault.symbol}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">NAV (denomination)</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900 dark:text-white">
            ${formatTokenAmount(vault.navDenomination, 18, 2)}
          </p>
        </div>
      </div>

      {/* ── Capital Distribution ─────────────────────────────────────────── */}
      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Capital Distribution
        </p>
        <CapitalBreakdownBar idle={idle} claimable={claimable} pending={pending} fundNav={fundNav} />

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Idle
            </span>
            <span className="tabular-nums text-neutral-900 dark:text-white">
              {formatTokenAmount(vault.idleAssets, d, 4)} {vault.symbol}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
              Claimable
            </span>
            <span className="tabular-nums text-neutral-900 dark:text-white">
              {formatTokenAmount(vault.claimableAssets, d, 4)} {vault.symbol}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
              Pending
            </span>
            <span className="tabular-nums text-neutral-900 dark:text-white">
              {formatTokenAmount(vault.pendingAssets, d, 4)} {vault.symbol}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
              Fund NAV
            </span>
            <span className="tabular-nums text-neutral-900 dark:text-white">
              {formatTokenAmount(vault.fundNavBalance, d, 4)} {vault.symbol}
            </span>
          </div>
        </div>

        {/* Per-strategy breakdown */}
        {vault.strategies.length > 0 && (
          <div className="mt-2 space-y-1 rounded-md border border-neutral-100 p-2 dark:border-neutral-800">
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
