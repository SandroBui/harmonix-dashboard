'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRoleCheck } from '@/lib/safe/hooks'
import { truncateAddress } from '@/lib/format'
import { getTimelockPageData } from '@/lib/timelocks-reader'
import DurationsTab from './DurationsTab'
import SubmitTab from './SubmitTab'
import RevokeTab from './RevokeTab'

type Tab = 'durations' | 'submit' | 'revoke'

const TAB_LABELS: Record<Tab, string> = {
  durations: 'Durations',
  submit: 'Submit Operation',
  revoke: 'Revoke Operation',
}

export default function TimelockClient() {
  const [activeTab, setActiveTab] = useState<Tab>('durations')
  const { safeAddress, hasRole, isSafeOwner } = useRoleCheck('admin')

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['timelocks', 'pageData'],
    queryFn: getTimelockPageData,
    refetchInterval: 300_000,
    staleTime: 60_000,
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
          Failed to load timelock data: {error instanceof Error ? error.message : 'Unknown error'}
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

  return (
    <div className="space-y-6">
      {/* Role banner */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Admin Safe: </span>
            <span className="font-mono text-neutral-900 dark:text-white">
              {safeAddress && safeAddress !== '0x' ? truncateAddress(safeAddress) : '—'}
            </span>
          </div>
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">FundVault: </span>
            <span className="font-mono text-neutral-900 dark:text-white">{truncateAddress(data.fundVaultAddress)}</span>
          </div>
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">VaultManagerAdmin: </span>
            <span className="font-mono text-neutral-900 dark:text-white">{truncateAddress(data.vaultManagerAdminAddress)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                hasRole
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
              }`}
            >
              {hasRole ? 'Admin role' : 'No admin role'}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isSafeOwner
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
              }`}
            >
              {isSafeOwner ? 'Safe owner' : 'Not owner'}
            </span>
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
            Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()} (auto-refresh every 5m)
          </p>
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
              {tab === 'revoke' && data.pendingOps.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {data.pendingOps.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'durations' && <DurationsTab timelocks={data.timelocks} />}
        {activeTab === 'submit' && <SubmitTab data={data} />}
        {activeTab === 'revoke' && <RevokeTab data={data} />}
      </div>
    </div>
  )
}
