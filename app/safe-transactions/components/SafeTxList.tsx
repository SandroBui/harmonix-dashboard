'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ROLE_LABELS } from '@/lib/safe/roles'
import type { RoleType } from '@/lib/safe/roles'
import type { SafeInfo, SafeTxBucket } from '@/lib/safe/types'
import { isRejectionTx, getSafeTxBucket } from '@/lib/safe/status'
import { useAssetMetadata } from '@/lib/hooks/use-asset-metadata'
import { formatTokenAmount } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import type { RoleTaggedTx } from '@/lib/safe/types'
import {
  formatTxTime,
  getTxDisplayDate,
  groupTxsByDate,
} from '@/lib/safe/date-grouping'
import SafeTxDetail from './SafeTxDetail'

export type SafeTxListMode = 'pending' | 'readonly'

type Props = {
  transactions: RoleTaggedTx[]
  vaultAssetMap: Record<string, string>
  mode?: SafeTxListMode
  /** Chain of the Safe these txs belong to — drives explorer links. */
  chainId: number
}

const ROLE_BADGE_COLORS: Record<RoleType, string> = {
  operator:           'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  curator:            'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  timelock_proposer:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  admin:              'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  sentinel:           'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  upgrade_executor:   'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  upgrader:           'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
}

const STATUS_BADGE: Record<SafeTxBucket, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  executed: {
    label: 'Executed',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  },
}

const HISTORY_STATUS: Record<SafeTxBucket, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'text-amber-600 dark:text-amber-400',
  },
  executed: {
    label: 'Success',
    className: 'text-green-600 dark:text-green-400',
  },
  failed: {
    label: 'Failed',
    className: 'text-red-600 dark:text-red-400',
  },
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function SafeMetaBadge({ safeAddress, safeInfo }: { safeAddress: string; safeInfo: SafeInfo | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
      {truncateAddress(safeAddress)}
      <CopyButton value={safeAddress} />
      {safeInfo && (
        <span className="text-neutral-400 dark:text-neutral-500">
          {' '}· {safeInfo.threshold}/{safeInfo.owners.length}
        </span>
      )}
    </span>
  )
}

function WarningIcon({ msg, color }: { msg: string; color: string }) {
  return (
    <span className={`group/warn relative inline-flex cursor-help shrink-0 ${color}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3.5 w-3.5"
      >
        <path
          fillRule="evenodd"
          d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 1 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <span className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 w-72 -translate-y-1/2 rounded-md bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/warn:opacity-100 dark:bg-neutral-700">
        {msg}
        <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-neutral-900 dark:border-l-neutral-700" />
      </span>
    </span>
  )
}

function RowIndex({ index }: { index: number }) {
  return (
    <span className="w-8 shrink-0 text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
      {index}
    </span>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

type TxRowShellProps = {
  tx: RoleTaggedTx
  isExpanded: boolean
  onToggle: () => void
  borderClassName: string
  rowClassName: string
  children: ReactNode
  chainId: number
  actionsEnabled: boolean
}

function TxRowShell({
  tx,
  isExpanded,
  onToggle,
  borderClassName,
  rowClassName,
  children,
  chainId,
  actionsEnabled,
}: TxRowShellProps) {
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white dark:bg-neutral-900 ${borderClassName}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className={rowClassName}
      >
        {children}
      </div>
      {isExpanded && (
        <SafeTxDetail
          tx={tx}
          safeInfo={tx.safeInfo}
          safeAddress={tx.safeAddress}
          actionsEnabled={actionsEnabled}
          chainId={chainId}
        />
      )}
    </div>
  )
}

type PendingRowProps = {
  tx: RoleTaggedTx
  index: number
  vaultAssetMap: Record<string, string>
  assetMetadata: ReturnType<typeof useAssetMetadata>['data']
  isExpanded: boolean
  onToggle: () => void
  chainId: number
  actionsEnabled: boolean
}

function SafeTxPendingRow({
  tx,
  index,
  vaultAssetMap,
  assetMetadata,
  isExpanded,
  onToggle,
  chainId,
  actionsEnabled,
}: PendingRowProps) {
  const rejection = isRejectionTx(tx, tx.safeAddress)
  const bucket = getSafeTxBucket(tx, tx.safeAddress)
  const status = STATUS_BADGE[bucket]

  const fulfillTokenAddr = tx.dataDecoded?.method === 'fulfillRedeem'
    ? vaultAssetMap[tx.to.toLowerCase()]
    : undefined
  const fulfillAsset = fulfillTokenAddr ? assetMetadata?.[fulfillTokenAddr] : undefined

  return (
    <TxRowShell
      tx={tx}
      isExpanded={isExpanded}
      onToggle={onToggle}
      borderClassName={
        rejection
          ? 'border-red-200 dark:border-red-900'
          : 'border-neutral-200 dark:border-neutral-700'
      }
      rowClassName="flex w-full cursor-pointer items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-neutral-800"
      chainId={chainId}
      actionsEnabled={actionsEnabled}
    >
      <RowIndex index={index} />
      <div className="min-w-0 flex-1 space-y-2">
        {rejection ? (
          <p className="truncate text-base font-semibold text-red-600 dark:text-red-400">
            Cancellation of tx #{tx.nonce}
          </p>
        ) : (
          <p className="truncate text-base font-semibold text-neutral-900 dark:text-white">
            {tx.summary}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${status.className}`}
          >
            {status.label}
          </span>
          {tx.roles.map((role) => (
            <span
              key={role}
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${ROLE_BADGE_COLORS[role]}`}
            >
              {ROLE_LABELS[role]}
            </span>
          ))}
          {fulfillAsset && (
            <span className="inline-flex items-center rounded-md bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
              {fulfillAsset.symbol}
            </span>
          )}
          {tx.fulfillPrecheck && (
            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              FundVault: {formatTokenAmount(tx.fulfillPrecheck.fundVaultBalance, tx.fulfillPrecheck.decimals, 4)} {tx.fulfillPrecheck.symbol}
            </span>
          )}
          {tx.fulfillPrecheck?.isInsufficient && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <WarningIcon
                color="text-red-500"
                msg={`Insufficient FundVault balance. Short by ${formatTokenAmount(tx.fulfillPrecheck.shortfall, tx.fulfillPrecheck.decimals, 4)} ${tx.fulfillPrecheck.symbol} (requires ${formatTokenAmount(tx.fulfillPrecheck.requiredAmount, tx.fulfillPrecheck.decimals, 4)} ${tx.fulfillPrecheck.symbol}, has ${formatTokenAmount(tx.fulfillPrecheck.fundVaultBalance, tx.fulfillPrecheck.decimals, 4)} ${tx.fulfillPrecheck.symbol}).`}
              />
              Insufficient FundVault
            </span>
          )}
          <SafeMetaBadge safeAddress={tx.safeAddress} safeInfo={tx.safeInfo} />
          {tx.executionDate && (
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {new Date(tx.executionDate).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <span
        className={`shrink-0 text-sm font-semibold ${
          tx.isExecutable
            ? 'text-green-600 dark:text-green-400'
            : 'text-amber-600 dark:text-amber-400'
        }`}
      >
        {tx.confirmationsCount}/{tx.confirmationsRequired}
        {tx.isExecutable ? ' ✓ Ready' : ' signed'}
      </span>

      <ChevronIcon expanded={isExpanded} />
    </TxRowShell>
  )
}

type HistoryRowProps = {
  tx: RoleTaggedTx
  index: number
  isExpanded: boolean
  onToggle: () => void
  chainId: number
}

function SafeTxHistoryRow({ tx, index, isExpanded, onToggle, chainId }: HistoryRowProps) {
  const rejection = isRejectionTx(tx, tx.safeAddress)
  const bucket = getSafeTxBucket(tx, tx.safeAddress)
  const status = HISTORY_STATUS[bucket]
  const displayDate = getTxDisplayDate(tx)
  const methodLabel = rejection
    ? 'Cancellation'
    : tx.summary

  return (
    <TxRowShell
      tx={tx}
      isExpanded={isExpanded}
      onToggle={onToggle}
      borderClassName={
        rejection
          ? 'border-red-200 dark:border-red-900'
          : 'border-neutral-200 dark:border-neutral-700'
      }
      rowClassName="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-neutral-800"
      chainId={chainId}
      actionsEnabled={false}
    >
      <RowIndex index={index} />
      <span
        className={`min-w-0 flex-1 truncate text-sm font-medium ${
          rejection
            ? 'text-red-600 dark:text-red-400'
            : 'text-neutral-900 dark:text-white'
        }`}
      >
        {methodLabel}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-neutral-400 dark:text-neutral-500">
        {formatTxTime(displayDate)}
      </span>
      <span className={`shrink-0 text-sm font-medium ${status.className}`}>
        {status.label}
      </span>
      <ChevronIcon expanded={isExpanded} />
    </TxRowShell>
  )
}

export default function SafeTxList({ transactions, vaultAssetMap, mode = 'pending', chainId }: Props) {
  const [expandedHash, setExpandedHash] = useState<string | null>(null)
  const { data: assetMetadata } = useAssetMetadata()
  const actionsEnabled = mode === 'pending'

  const dateGroups = useMemo(
    () => (mode === 'readonly' ? groupTxsByDate(transactions) : []),
    [mode, transactions],
  )
  const indexedDateGroups = useMemo(() => {
    let running = 0
    return dateGroups.map((group) => ({
      dateKey: group.dateKey,
      label: group.label,
      txs: group.txs.map((tx) => {
        running += 1
        return { tx, index: running }
      }),
    }))
  }, [dateGroups])

  function toggleExpanded(hash: string) {
    setExpandedHash((current) => (current === hash ? null : hash))
  }

  if (mode === 'readonly') {
    return (
      <div className="space-y-6">
        {indexedDateGroups.map((group) => (
          <section key={group.dateKey}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.txs.map(({ tx, index }) => (
                <SafeTxHistoryRow
                  key={tx.safeTxHash}
                  tx={tx}
                  index={index}
                  isExpanded={expandedHash === tx.safeTxHash}
                  onToggle={() => toggleExpanded(tx.safeTxHash)}
                  chainId={chainId}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx, i) => (
        <SafeTxPendingRow
          key={tx.safeTxHash}
          tx={tx}
          index={i + 1}
          vaultAssetMap={vaultAssetMap}
          assetMetadata={assetMetadata}
          isExpanded={expandedHash === tx.safeTxHash}
          onToggle={() => toggleExpanded(tx.safeTxHash)}
          chainId={chainId}
          actionsEnabled={actionsEnabled}
        />
      ))}
    </div>
  )
}
