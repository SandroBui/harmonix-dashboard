'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useReadContract } from 'wagmi'
import { getAddress } from 'viem'
import { HA_TIME_LOCK_ABI } from '@/lib/abis'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import { getDefaultSafeAddress } from '@/lib/safe/roles'
import { OZ_PROPOSER_ROLE } from '@/lib/oz-timelock-roles'
import { getUpgradesV2PageData, getUpgradesV2ShellData, resolveKnownContracts } from '@/lib/upgrades-v2-reader'
import { readStoredUpgradeOps, storedIds } from '@/lib/upgrades-v2-storage'
import { useVaultConfig } from '@/lib/vault-context'
import ScheduleV2Tab from './ScheduleV2Tab'
import ExecuteV2Tab from './ExecuteV2Tab'

type Tab = 'schedule' | 'execute'

const TAB_LABELS: Record<Tab, string> = {
  schedule: 'Schedule Upgrade',
  execute: 'Execute Upgrade',
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

function buildSafeOptions(config: ReturnType<typeof useVaultConfig>) {
  const seen = new Set<string>()
  const out: { label: string; address: string }[] = []
  const candidates: { label: string; address?: `0x${string}` }[] = [
    { label: 'Timelock Proposer Safe', address: config.safe.timelockProposer },
    { label: 'Admin Safe', address: config.safe.admin },
    { label: 'Operator Safe', address: config.safe.operator },
    { label: 'Default Safe', address: config.safe.default },
  ]
  for (const { label, address } of candidates) {
    const resolved = address ?? getDefaultSafeAddress(config)
    const lower = resolved.toLowerCase()
    if (seen.has(lower) || lower === '0x0000000000000000000000000000000000000000') continue
    seen.add(lower)
    out.push({ label, address: resolved })
  }
  return out
}

function OperationsLoadingPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading pending operations from chain…
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
      ))}
    </div>
  )
}

export default function UpgradesV2Client() {
  const [activeTab, setActiveTab] = useState<Tab>('schedule')
  const vaultConfig = useVaultConfig()
  const { address } = useAccount()

  const safeOptions = useMemo(() => buildSafeOptions(vaultConfig), [vaultConfig])
  const shellData = useMemo(() => getUpgradesV2ShellData(vaultConfig), [vaultConfig])

  const { data: resolvedContracts } = useQuery({
    queryKey: ['upgrades-v2-contracts', vaultConfig.slug],
    queryFn: () => resolveKnownContracts(vaultConfig),
    staleTime: Infinity,
  })

  const controllerAddress = vaultConfig.timelockControllerAddress
  const controllerResolved =
    controllerAddress &&
    controllerAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
      ? (getAddress(controllerAddress) as `0x${string}`)
      : null

  const { data: walletHasProposer } = useReadContract({
    address: controllerResolved ?? undefined,
    abi: HA_TIME_LOCK_ABI,
    functionName: 'hasRole',
    args: address && controllerResolved ? [OZ_PROPOSER_ROLE, address] : undefined,
    query: { enabled: Boolean(controllerResolved && address) },
  })

  const { data: minDelayOnChain, isFetching: minDelayLoading } = useReadContract({
    address: controllerResolved ?? undefined,
    abi: HA_TIME_LOCK_ABI,
    functionName: 'getMinDelay',
    query: { enabled: Boolean(controllerResolved) },
  })

  const {
    data: operationsData,
    isLoading: operationsLoading,
    isError: operationsError,
    error: operationsFetchError,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['upgrades-v2', vaultConfig.slug],
    queryFn: async () => {
      const stored = readStoredUpgradeOps(vaultConfig.slug)
      const load = getUpgradesV2PageData(vaultConfig, storedIds(vaultConfig.slug), stored)
      const timeoutMs = 45_000
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timed out loading upgrades data (RPC slow?)')), timeoutMs)
      })
      return Promise.race([load, timeout])
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  })

  const scheduleData = useMemo(() => {
    const minDelay =
      operationsData?.minDelay ??
      (minDelayOnChain !== undefined ? minDelayOnChain.toString() : shellData.minDelay)
    const knownContracts =
      resolvedContracts ?? operationsData?.knownContracts ?? shellData.knownContracts
    return {
      ...(operationsData ?? shellData),
      minDelay,
      controllerAddress: shellData.controllerAddress,
      knownContracts,
    }
  }, [operationsData, minDelayOnChain, shellData, resolvedContracts])

  const pendingCount = operationsData?.operations.length ?? 0
  const operationsReady = Boolean(operationsData)

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="flex flex-wrap items-start gap-4 text-sm">
          <div className="space-y-1">
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Timelock Controller: </span>
              {shellData.controllerAddress ? (
                <>
                  <span className="font-mono text-neutral-900 dark:text-white">
                    {truncateAddress(shellData.controllerAddress)}
                  </span>
                  <CopyButton value={shellData.controllerAddress} />
                </>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">Not configured</span>
              )}
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Min delay: </span>
              <span className="font-medium text-neutral-900 dark:text-white">
                {minDelayLoading && minDelayOnChain === undefined && !operationsData
                  ? '…'
                  : formatDuration(scheduleData.minDelay)}
              </span>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <RoleBadge label="Proposer (wallet)" active={walletHasProposer === true} />
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {dataUpdatedAt > 0 && (
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            Operations synced: {new Date(dataUpdatedAt).toLocaleTimeString()} (auto-refresh every
            60s)
          </p>
        )}
        {operationsLoading && !operationsReady && (
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            Syncing pending operations in the background…
          </p>
        )}

        {!shellData.controllerAddress && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            Set <code className="font-mono">timelockControllerAddress</code> in vault config for
            hype-hahype-vault.
          </div>
        )}
      </div>

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
              {tab === 'execute' && operationsReady && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="min-h-[42rem] rounded-lg border border-neutral-200 bg-white p-6 sm:p-8 dark:border-neutral-700 dark:bg-neutral-900">
          {activeTab === 'schedule' && (
            <ScheduleV2Tab data={scheduleData} proposerSafes={safeOptions} />
          )}
          {activeTab === 'execute' && (
            <>
              {operationsLoading && !operationsReady && <OperationsLoadingPanel />}
              {operationsError && !operationsReady && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    Failed to load pending operations:{' '}
                    {operationsFetchError instanceof Error
                      ? operationsFetchError.message
                      : 'Unknown error'}
                  </div>
                  <button
                    onClick={() => refetch()}
                    className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    Retry
                  </button>
                </div>
              )}
              {operationsReady && operationsData && (
                <ExecuteV2Tab data={operationsData} executorSafes={safeOptions} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function RoleBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
      }`}
    >
      {label}
    </span>
  )
}
