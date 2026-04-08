import type { VaultOverviewData } from '@/lib/status-reader'
import { formatTokenAmount } from '@/lib/format'
import Tooltip from '@/app/components/Tooltip'
import VaultBalanceActions from './VaultBalanceActions'

const REDEEM_MODE_LABELS: Record<number, string> = {
  0: 'Global',
  1: 'Per Asset',
}

const COLUMN_TOOLTIPS: Record<string, string> = {
  'Vault Asset': 'Current asset token balance held by the vault contract.',
  'Fund Balance': 'Current asset token balance held by the FundVault contract.',
  'Pending Assets':
    'Assets that have been requested for withdrawal but not yet fulfilled by the operator.',
  'Claimable Assets':
    'Assets that have been fulfilled by the operator and are now ready to be withdrawn from the vault.',
  'Locked Shares':
    'Share tokens locked in the vault when requestRedeem was called. They remain locked until the operator fulfills the withdrawal.',
}

type Props = {
  queueLength: number
  redeemMode: number
  vaults: VaultOverviewData[]
  redeemActiveCount: number
  redeemFulfilledCount: number
}

export default function WithdrawalQueueSummary({
  queueLength,
  redeemMode,
  vaults,
  redeemActiveCount,
  redeemFulfilledCount,
}: Props) {
  // Sum redeemShares from each vault — these are the *currently pending* locked shares.
  // (getNavSnapshot().globalRedeemShares is a cumulative NAV accounting figure and
  //  includes already-fulfilled shares, so it should NOT be used here.)
  const lockedRedeemShares = vaults
    .reduce((sum, v) => sum + BigInt(v.redeemShares), 0n)
    .toString()

  // Show a row for every vault that has any redemption activity or a non-zero balance
  const vaultRows = vaults.filter(
    (v) =>
      BigInt(v.pendingAssets) > 0n ||
      BigInt(v.claimableAssets) > 0n ||
      BigInt(v.vaultAssetBalance) > 0n,
  )

  const cards = [
    {
      label: 'Queue Length',
      custom: (
        <div className="mt-1 flex items-end gap-3">
          <div>
            <p className="text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">
              {redeemActiveCount.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">pending</p>
          </div>
          <span className="mb-5 text-neutral-300 dark:text-neutral-600">/</span>
          <div>
            <p className="text-xl font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
              {redeemFulfilledCount.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">fulfilled</p>
          </div>
        </div>
      ),
      sub: 'Requests with shares > 0',
    },
    {
      label: 'Locked Redeem Shares',
      value: formatTokenAmount(lockedRedeemShares, 18, 2),
      sub: 'Shares currently held pending fulfillment',
    },
    {
      label: 'Redeem Mode',
      value: REDEEM_MODE_LABELS[redeemMode] ?? `Unknown (${redeemMode})`,
      sub: 'Current withdrawal policy',
    },
  ]

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
        Withdrawal Queue
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-neutral-200 bg-white p-4 transition-all duration-150 cursor-default hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
          >
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{card.label}</p>
            {'custom' in card
              ? card.custom
              : (
                <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-white">
                  {card.value}
                </p>
              )
            }
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Per-vault pending/claimable breakdown (only shown if there's something queued) */}
      {vaultRows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-800/50">
                {['Vault', 'Vault Asset', 'Claimable Assets', 'Fund Balance', 'Pending Assets', 'Locked Shares', 'Actions'].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400"
                  >
                    {COLUMN_TOOLTIPS[col] ? (
                      <Tooltip text={COLUMN_TOOLTIPS[col]} position="bottom" width="w-64">
                        {col}
                      </Tooltip>
                    ) : (
                      col
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {vaultRows.map((v) => (
                <tr key={v.vault} className="bg-white dark:bg-neutral-900">
                  <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-white">
                    {v.symbol} Vault
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-neutral-700 dark:text-neutral-300">
                    {formatTokenAmount(v.vaultAssetBalance, v.decimals, 4)} {v.symbol}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-blue-600 dark:text-blue-400">
                    {formatTokenAmount(v.claimableAssets, v.decimals, 4)} {v.symbol}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {(() => {
                      const fundBal = BigInt(v.fundVaultBalance)
                      const pending = BigInt(v.pendingAssets)
                      const isUnderfunded = pending > 0n && fundBal < pending
                      return (
                        <span className="inline-flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                          {formatTokenAmount(v.fundVaultBalance, v.decimals, 4)} {v.symbol}
                          {isUnderfunded && (
                            <span className="group/warn relative inline-flex cursor-help shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-red-500">
                                <path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 1 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                              </svg>
                              <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-md bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/warn:opacity-100 dark:bg-neutral-700">
                                We don't have enough asset to fulfill for all users.
                                <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-700" />
                              </span>
                            </span>
                          )}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-yellow-600 dark:text-yellow-400">
                    {formatTokenAmount(v.pendingAssets, v.decimals, 4)} {v.symbol}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-neutral-600 dark:text-neutral-300">
                    {formatTokenAmount(v.redeemShares, 18, 4)}
                  </td>
                  <td className="px-4 py-2.5">
                    <VaultBalanceActions
                      vault={v.vault}
                      vaultAssetBalance={v.vaultAssetBalance}
                      claimableAssets={v.claimableAssets}
                      decimals={v.decimals}
                      symbol={v.symbol}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
