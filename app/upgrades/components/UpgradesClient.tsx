'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRoleCheck } from '@/lib/safe/hooks'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import { getUpgradesPageData } from '@/lib/upgrades-reader'
import { useVaultConfig } from '@/lib/vault-context'
import OperationsTab from './OperationsTab'
import ScheduleTab from './ScheduleTab'

type Tab = 'operations' | 'schedule'

const TAB_LABELS: Record<Tab, string> = {
  operations: 'Operations',
  schedule: 'Schedule Upgrade',
}

function formatDuration(seconds: string): string {
  const s = Number(seconds)
  if (s === 0) return '0s (no delay)'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

export default function UpgradesClient() {
  const [activeTab, setActiveTab] = useState<Tab>('operations')
  const vaultConfig = useVaultConfig()

  const { hasRole: isProposer, isSafeOwner: isProposerOwner } = useRoleCheck('timelock_proposer')
  const { hasRole: isSentinel } = useRoleCheck('sentinel')
  const { hasRole: isExecutor, isSafeOwner: isExecutorOwner } = useRoleCheck('upgrade_executor')

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['upgrades', 'pageData', vaultConfig.slug],
    queryFn: () => getUpgradesPageData(vaultConfig),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load upgrades data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Retry
        </button>
      </div>
    )
  }

  const pendingCount = data.operations.filter((op) => op.state === 'Waiting' || op.state === 'Ready').length

  return (
    <div className="space-y-6">
      {/* Overview banner */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="flex flex-wrap items-start gap-4 text-sm">
          {/* Contract + delay */}
          <div className="space-y-1">
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Timelock Controller: </span>
              {data.controllerAddress ? (
                <>
                  <span className="font-mono text-neutral-900 dark:text-white">
                    {truncateAddress(data.controllerAddress)}
                  </span>
                  <CopyButton value={data.controllerAddress} />
                </>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">Not configured</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-neutral-500 dark:text-neutral-400">Min delay: </span>
              <span className="font-medium text-neutral-900 dark:text-white">
                {formatDuration(data.minDelay)}
              </span>
              <span className="ml-1 cursor-help text-xs text-neutral-400" title="To change the min delay, use the Custom preset in Schedule Upgrade targeting the controller itself with an updateDelay(newDelay) call. Wait the current minDelay, then execute.">
                ⓘ
              </span>
            </div>
          </div>

          {/* Role badges */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <RoleBadge label="Proposer" hasRole={isProposer} isOwner={isProposerOwner} />
            <RoleBadge label="Sentinel" hasRole={isSentinel} />
            <RoleBadge label="Executor" hasRole={isExecutor} isOwner={isExecutorOwner} />
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {isFetching ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        {dataUpdatedAt > 0 && (
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()} (auto-refresh every 60s)
          </p>
        )}

        {!data.controllerAddress && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            No contract found holding <code className="font-mono">UPGRADER_ROLE</code> on AccessManager.
            The HaTimelockController must be granted this role to appear here.
          </div>
        )}
      </div>

      {/* Tabs */}
      <div>
        <div className="mb-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              {TAB_LABELS[tab]}
              {tab === 'operations' && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'operations' && <OperationsTab data={data} />}
        {activeTab === 'schedule' && <ScheduleTab data={data} />}
      </div>
    </div>
  )
}

function RoleBadge({
  label,
  hasRole,
  isOwner,
}: {
  label: string
  hasRole: boolean
  isOwner?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          hasRole
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
        }`}
      >
        {label}
      </span>
      {isOwner !== undefined && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isOwner
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
          }`}
        >
          {isOwner ? 'Owner' : 'Not owner'}
        </span>
      )}
    </div>
  )
}
