'use client'

import type { PendingSafeTx, SafeInfo } from '@/lib/safe/types'
import { formatTokenAmount } from '@/lib/format'
import { useLiveNavSnapshot } from '@/lib/hooks/use-live-nav'
import { safeTxExplorerUrl } from '@/lib/safe/chains'
import CopyButton from '@/app/components/CopyButton'
import DecodedCalldata from './DecodedCalldata'
import SafeTxActions from './SafeTxActions'

type Props = {
  tx: PendingSafeTx
  safeInfo: SafeInfo | undefined
  safeAddress: `0x${string}`
  /** Sign / Execute / Cancel only on Pending tab */
  actionsEnabled?: boolean
  /** Chain of the Safe — drives the explorer link. */
  chainId: number
}

function truncate(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const NAV_TOUCHING_METHODS = new Set(['allocate', 'deallocate', 'syncNavValue', 'updateNav'])

/**
 * Returns true when this tx (or any of its multiSend inner calls) writes to
 * vault state that materially moves PPS — the executor benefits from seeing
 * the live PPS / liveNav before they execute.
 */
function touchesNav(tx: PendingSafeTx): boolean {
  const d = tx.dataDecoded
  if (!d) return false
  if (NAV_TOUCHING_METHODS.has(d.method)) return true
  return (d.multiSendInner ?? []).some((c) => c.decoded && NAV_TOUCHING_METHODS.has(c.decoded.method))
}

export default function SafeTxDetail({
  tx,
  safeInfo,
  safeAddress,
  actionsEnabled = true,
  chainId,
}: Props) {
  const showLiveNav = touchesNav(tx) && actionsEnabled
  const liveNav = useLiveNavSnapshot({ enabled: showLiveNav })
  const toLabel = [tx.dataDecoded?.protocolName, tx.dataDecoded?.contractName]
    .filter(Boolean)
    .join(' - ')

  return (
    <div className="space-y-4 border-t border-neutral-200 px-4 py-4 dark:border-neutral-700">
      {/* Decoded calldata */}
      <DecodedCalldata decoded={tx.dataDecoded} rawData={tx.data} to={tx.to} />

      {/* Live NAV snapshot — only for NAV-touching txs. Fetched fresh on every
          render of the expanded card so executors see the current state. */}
      {showLiveNav && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800/50">
          <div className="mb-1.5 flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span>Live VaultManager.computeNav() — pre-execution snapshot</span>
            {liveNav.isLoading && <span className="text-neutral-400">loading…</span>}
            {liveNav.isError && <span className="text-red-500">read failed</span>}
          </div>
          {liveNav.data ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Current PPS (stored)</p>
                {/* Full WAD precision (trailing zeros stripped) — PPS is consumed on-chain
                    at 1e18 scale, so rounding the display would hide the precise value. */}
                <p className="mt-0.5 break-all font-mono text-neutral-900 dark:text-white">
                  {formatTokenAmount(liveNav.data.storedPps.toString(), 18, 18)}
                </p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Live PPS</p>
                <p className="mt-0.5 break-all font-mono text-neutral-900 dark:text-white">
                  {formatTokenAmount(liveNav.data.livePpsValue.toString(), 18, 18)}
                  {!liveNav.data.isValidPps && (
                    <span className="ml-1 text-red-500">(invalid)</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Live NAV (denom)</p>
                <p className="mt-0.5 font-mono text-neutral-900 dark:text-white">
                  ${formatTokenAmount(liveNav.data.navDenomination.toString(), 18, 6)}
                </p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Effective NAV</p>
                <p className="mt-0.5 font-mono text-neutral-900 dark:text-white">
                  ${formatTokenAmount(liveNav.data.effNavDenomination.toString(), 18, 6)}
                </p>
              </div>
            </div>
          ) : (
            !liveNav.isLoading && !liveNav.isError && (
              <p className="text-neutral-400">No data.</p>
            )
          )}
        </div>
      )}

      {tx.fulfillPrecheck && (
        <div className={`rounded-md border px-3 py-2 text-sm ${tx.fulfillPrecheck.isInsufficient
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300'
          : 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}>
          <p>
            FundVault balance: {formatTokenAmount(tx.fulfillPrecheck.fundVaultBalance, tx.fulfillPrecheck.decimals, 4)} {tx.fulfillPrecheck.symbol}
          </p>
          {tx.fulfillPrecheck.isInsufficient && (
            <p className="mt-1">
              Requires {formatTokenAmount(tx.fulfillPrecheck.requiredAmount, tx.fulfillPrecheck.decimals, 4)} {tx.fulfillPrecheck.symbol}, short by {formatTokenAmount(tx.fulfillPrecheck.shortfall, tx.fulfillPrecheck.decimals, 4)} {tx.fulfillPrecheck.symbol}.
            </p>
          )}
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <span className="text-neutral-500">To</span>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300">
            {toLabel && <span>{toLabel}</span>}
            <span className="inline-flex items-center font-mono">
              {truncate(tx.to)}
              <CopyButton value={tx.to} />
            </span>
          </p>
        </div>
        <div>
          <span className="text-neutral-500">Submitted</span>
          <p className="mt-0.5 text-neutral-700 dark:text-neutral-300">
            {new Date(tx.submissionDate).toLocaleString()}
          </p>
        </div>
        {tx.executionDate && (
          <div>
            <span className="text-neutral-500">Executed</span>
            <p className="mt-0.5 text-neutral-700 dark:text-neutral-300">
              {new Date(tx.executionDate).toLocaleString()}
            </p>
          </div>
        )}
        {tx.transactionHash && (
          <div>
            <span className="text-neutral-500">Tx hash</span>
            <p className="mt-0.5">
              <a
                href={safeTxExplorerUrl(chainId, tx.transactionHash) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                {truncate(tx.transactionHash)}
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Confirmation list */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-neutral-900 dark:text-white">
          Confirmations ({tx.confirmationsCount}/{tx.confirmationsRequired})
        </h4>
        <ul className="space-y-1">
          {/* Signed */}
          {tx.confirmations.map((conf) => (
            <li key={conf.owner} className="flex items-center gap-2 text-xs">
              <span className="text-green-500">✓</span>
              <code className="font-mono text-neutral-600 dark:text-neutral-300">{conf.owner}</code>
              <span className="text-neutral-400">
                {new Date(conf.submissionDate).toLocaleString()}
              </span>
            </li>
          ))}
          {/* Pending owners */}
          {safeInfo?.owners
            .filter((o) => !tx.confirmations.some((c) => c.owner.toLowerCase() === o.toLowerCase()))
            .map((owner) => (
              <li key={owner} className="flex items-center gap-2 text-xs">
                <span className="text-neutral-300 dark:text-neutral-600">○</span>
                <code className="font-mono text-neutral-400 dark:text-neutral-500">{owner}</code>
                <span className="text-neutral-400">pending</span>
              </li>
            ))}
        </ul>
      </div>

      {/* Safe tx hash */}
      <div className="text-xs text-neutral-400 dark:text-neutral-500">
        <span>Safe tx hash: </span>
        <code className="font-mono">{truncate(tx.safeTxHash)}</code>
      </div>

      {/* Actions — Pending tab only */}
      {actionsEnabled && (
        <SafeTxActions tx={tx} safeInfo={safeInfo} safeAddress={safeAddress} />
      )}
    </div>
  )
}
