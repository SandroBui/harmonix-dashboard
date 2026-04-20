'use client'

import Link from 'next/link'
import { useState, Fragment } from 'react'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { FUND_NAV_FEED_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useResolvedRoleSafes } from '@/lib/safe/hooks'
import { getResolvedSafeAddressForRole } from '@/lib/safe/roles'
import { useVaultConfig } from '@/lib/vault-context'
import { useFundNavFeedAddress } from '@/lib/hooks/use-fund-nav-feed'
import { formatTokenAmount } from '@/lib/format'
import type { NavCategoryData } from '@/lib/nav-reader'
import SyncNavForm from './SyncNavForm'
import AddCategoryForm from './AddCategoryForm'

export type Roles = {
  isConnected: boolean
  isSafeOwner: boolean
  safeHasOperator: boolean
  safeHasAdmin: boolean
}

type Props = {
  asset: string
  symbol: string
  decimals: number
  categories: NavCategoryData[]
  roles: Roles
}

type ActionState = { type: 'sync'; description: string } | { type: 'add' } | null

// ── Tooltip wrapper ───────────────────────────────────────────────────────────
// Pure CSS hover tooltip — wraps any button so the tooltip sits above it.
function ActionTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-neutral-700 dark:ring-1 dark:ring-neutral-600">
        {text}
        {/* Arrow */}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-700" />
      </span>
    </span>
  )
}

// ── Shared button size / shape ────────────────────────────────────────────────
const btnBase =
  'inline-flex items-center justify-center rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40'

// ── Per-row actions ───────────────────────────────────────────────────────────
function CategoryRowActions({
  asset,
  category,
  roles,
  onSyncClick,
}: {
  asset: string
  category: NavCategoryData
  roles: Roles
  onSyncClick: () => void
}) {
  const { chainId } = useAccount()
  const config = useVaultConfig()
  const { data: resolved } = useResolvedRoleSafes()
  const adminSafeAddress = getResolvedSafeAddressForRole(config, 'admin', resolved?.resolvedSafes)
  const feedAddress = useFundNavFeedAddress()
  const assetAddress = getAddress(asset) as `0x${string}`
  const isWrongChain = roles.isConnected && chainId !== 999

  const canProposePriceUpdater =
    roles.isConnected && !isWrongChain && roles.isSafeOwner && roles.safeHasOperator
  const canProposeAdmin =
    roles.isConnected && !isWrongChain && roles.isSafeOwner && roles.safeHasAdmin

  const toggleTx = useProposeSafeTransaction(adminSafeAddress)
  const removeTx = useProposeSafeTransaction(adminSafeAddress)
  const [confirmRemove, setConfirmRemove] = useState(false)

  function handleToggle() {
    if (!feedAddress) return
    toggleTx.reset()
    const calldata = encodeFunctionData({
      abi: FUND_NAV_FEED_ABI,
      functionName: 'setCategoryStatus',
      args: [assetAddress, category.description, !category.isActive],
    })
    toggleTx.mutate({ to: getAddress(feedAddress) as `0x${string}`, data: calldata })
  }

  function handleRemoveSafe() {
    if (!feedAddress) return
    removeTx.reset()
    const calldata = encodeFunctionData({
      abi: FUND_NAV_FEED_ABI,
      functionName: 'removeNavCategory',
      args: [assetAddress, category.description],
    })
    removeTx.mutate({ to: getAddress(feedAddress) as `0x${string}`, data: calldata })
    setConfirmRemove(false)
  }

  return (
    <div className="flex items-center justify-end gap-2">

      {/* ── Sync ─────────────────────────────────────────────── */}
      <ActionTooltip text="Push a new NAV value for this category via Safe proposal">
        <button
          onClick={onSyncClick}
          disabled={!canProposePriceUpdater}
          className={`${btnBase} bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-500`}
        >
          Sync
        </button>
      </ActionTooltip>

      {/* ── Activate / Deactivate ────────────────────────────── */}
      {category.isActive ? (
        <ActionTooltip text="Deactivate this category — it will be excluded from NAV computation">
          <button
            onClick={handleToggle}
            disabled={!canProposeAdmin || toggleTx.isPending}
            className={`${btnBase} bg-amber-500 text-white hover:bg-amber-400 focus-visible:ring-amber-400`}
          >
            {toggleTx.isPending ? '…' : toggleTx.isSuccess ? '✓ Done' : 'Deactivate'}
          </button>
        </ActionTooltip>
      ) : (
        <ActionTooltip text="Activate this category — it will be included in NAV computation">
          <button
            onClick={handleToggle}
            disabled={!canProposeAdmin || toggleTx.isPending}
            className={`${btnBase} bg-green-600 text-white hover:bg-green-500 focus-visible:ring-green-500`}
          >
            {toggleTx.isPending ? '…' : toggleTx.isSuccess ? '✓ Done' : 'Activate'}
          </button>
        </ActionTooltip>
      )}

      {/* Toggle error */}
      {toggleTx.isError && (
        <ActionTooltip text={toggleTx.error?.message ?? 'Transaction failed'}>
          <span className="inline-flex cursor-help items-center rounded-md bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Failed
          </span>
        </ActionTooltip>
      )}

      {/* ── Remove ───────────────────────────────────────────── */}
      {confirmRemove ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-red-500 dark:text-red-400">Remove?</span>
          <button
            onClick={handleRemoveSafe}
            disabled={removeTx.isPending}
            className={`${btnBase} bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500`}
          >
            {removeTx.isPending ? '…' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirmRemove(false)}
            className={`${btnBase} bg-neutral-200 text-neutral-700 hover:bg-neutral-300 focus-visible:ring-neutral-400 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600`}
          >
            Cancel
          </button>
          {removeTx.isSuccess && (
            <Link
              href="/safe-transactions"
              className="text-xs text-blue-500 hover:underline dark:text-blue-400"
            >
              View →
            </Link>
          )}
          {removeTx.isError && (
            <ActionTooltip text={removeTx.error?.message ?? 'Transaction failed'}>
              <span className="cursor-help text-xs text-red-500">Failed</span>
            </ActionTooltip>
          )}
        </div>
      ) : (
        <ActionTooltip text="Permanently delete this NAV category via Safe proposal">
          <button
            onClick={() => setConfirmRemove(true)}
            disabled={!canProposeAdmin}
            className={`${btnBase} bg-red-600/10 text-red-600 ring-1 ring-red-500/30 hover:bg-red-600 hover:text-white focus-visible:ring-red-500 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-700/40 dark:hover:bg-red-600 dark:hover:text-white`}
          >
            Remove
          </button>
        </ActionTooltip>
      )}
    </div>
  )
}

// ── Main table ────────────────────────────────────────────────────────────────

export default function CategoryTable({ asset, symbol, decimals, categories, roles }: Props) {
  const [activeAction, setActiveAction] = useState<ActionState>(null)

  const canProposePriceUpdater =
    roles.isConnected && roles.isSafeOwner && roles.safeHasOperator
  const canProposeAdmin =
    roles.isConnected && roles.isSafeOwner && roles.safeHasAdmin

  if (categories.length === 0 && !canProposeAdmin) {
    return (
      <div className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
        No categories configured for this asset.
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Categories table */}
      {categories.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-100 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">NAV Value</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {categories.map((cat) => (
                <Fragment key={cat.description}>
                  <tr
                    className="bg-white hover:bg-neutral-50/80 dark:bg-neutral-900 dark:hover:bg-neutral-800/40"
                  >
                    <td className="px-4 py-3 font-mono text-sm text-neutral-700 dark:text-neutral-300">
                      {cat.description}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          cat.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            cat.isActive ? 'bg-green-500' : 'bg-neutral-400'
                          }`}
                        />
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900 dark:text-white">
                      {formatTokenAmount(cat.nav, decimals, 4)}
                      <span className="ml-1.5 text-xs font-normal text-neutral-400">{symbol}</span>
                    </td>
                    <td className="px-4 py-3">
                      <CategoryRowActions
                        asset={asset}
                        category={cat}
                        roles={roles}
                        onSyncClick={() =>
                          setActiveAction(
                            activeAction?.type === 'sync' &&
                            activeAction.description === cat.description
                              ? null
                              : { type: 'sync', description: cat.description },
                          )
                        }
                      />
                    </td>
                  </tr>

                  {/* Sync form expands inline directly below its row */}
                  {activeAction?.type === 'sync' &&
                    activeAction.description === cat.description && (
                      <tr
                        key={`${cat.description}-sync`}
                        className="bg-blue-50/50 dark:bg-blue-900/10"
                      >
                        <td colSpan={4} className="px-4 py-3">
                          <SyncNavForm
                            asset={asset}
                            decimals={decimals}
                            symbol={symbol}
                            category={cat}
                            canPropose={canProposePriceUpdater}
                            isConnected={roles.isConnected}
                            onClose={() => setActiveAction(null)}
                          />
                        </td>
                      </tr>
                    )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add category */}
      {canProposeAdmin &&
        (activeAction?.type === 'add' ? (
          <AddCategoryForm
            asset={asset}
            canPropose={canProposeAdmin}
            isConnected={roles.isConnected}
            onClose={() => setActiveAction(null)}
          />
        ) : (
          <button
            onClick={() => setActiveAction({ type: 'add' })}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:text-neutral-300"
          >
            <span>+</span> Add category
          </button>
        ))}
    </div>
  )
}
