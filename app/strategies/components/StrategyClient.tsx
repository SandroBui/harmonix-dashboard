'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress, parseUnits, decodeFunctionData } from 'viem'
import { FUND_VAULT_ABI, HA_BASE_ABI } from '@/lib/abis'
import { useAssetMetadata } from '@/lib/hooks/use-asset-metadata'
import { useProposeSafeTransaction, useRoleCheck } from '@/lib/safe/hooks'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import { useTimelockStatus, useFundVaultPending } from '@/lib/hooks/use-timelock-status'
import type { PendingOp } from '@/lib/hooks/use-timelock-status'
import { useCountdown } from '@/lib/hooks/use-countdown'
import { TIMELOCKED_FUNCTIONS } from '@/lib/timelocks-reader'
import type { StrategyPageData, AssetStrategySummary, StrategyData } from '@/lib/strategy-reader'

type Props = { data: StrategyPageData }

// ─── Action types ────────────────────────────────────────────────────────────

type ActionType = 'addStrategy' | 'removeStrategy' | 'setStrategyCap' | 'allocate' | 'deallocate'

const ACTION_LABELS: Record<ActionType, string> = {
  addStrategy: 'Add Strategy',
  removeStrategy: 'Remove Strategy',
  setStrategyCap: 'Set Cap',
  allocate: 'Allocate',
  deallocate: 'Deallocate',
}

const TIMELOCKABLE_ACTIONS: Set<ActionType> = new Set([
  'addStrategy', 'removeStrategy', 'setStrategyCap',
])

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds === 0) return '0s'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StrategyClient({ data }: Props) {
  const { isConnected, chainId } = useAccount()
  const { data: assetMetadata } = useAssetMetadata()

  // Curator Safe — for direct proposals and execute
  const { safeAddress, isSafeOwner, hasRole } = useRoleCheck('curator')
  const proposeTx = useProposeSafeTransaction(safeAddress)

  // Timelock Proposer Safe — for timelock submit
  const timelockProposerCheck = useRoleCheck('timelock_proposer')
  const timelockProposeTx = useProposeSafeTransaction(timelockProposerCheck.safeAddress)

  const [activeAction, setActiveAction] = useState<ActionType | null>(null)
  const [strategyInput, setStrategyInput] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<string>(data.assets[0]?.asset ?? '')

  const isWrongChain = isConnected && chainId !== 999
  const fundVaultAddress = getAddress(data.fundVaultAddress) as `0x${string}`

  // Find current asset context for decimals
  const currentAssetSummary = data.assets.find((a) => a.asset === selectedAsset)
  const currentDecimals = currentAssetSummary?.decimals ?? 18

  // Strategies for the currently selected asset
  const allStrategies = currentAssetSummary?.strategies ?? []

  // ── Reactive calldata computation ────────────────────────────────────────
  const encodedCalldata = useMemo((): `0x${string}` | undefined => {
    if (!activeAction || !strategyInput) return undefined
    try {
      const addr = getAddress(strategyInput)
      switch (activeAction) {
        case 'addStrategy':
          return encodeFunctionData({ abi: FUND_VAULT_ABI, functionName: 'addStrategy', args: [addr] })
        case 'removeStrategy':
          return encodeFunctionData({ abi: FUND_VAULT_ABI, functionName: 'removeStrategy', args: [addr] })
        case 'setStrategyCap':
          if (!amountInput) return undefined
          return encodeFunctionData({ abi: FUND_VAULT_ABI, functionName: 'setStrategyCap', args: [addr, parseUnits(amountInput, currentDecimals)] })
        case 'allocate':
          if (!amountInput) return undefined
          return encodeFunctionData({ abi: FUND_VAULT_ABI, functionName: 'allocate', args: [addr, parseUnits(amountInput, currentDecimals)] })
        case 'deallocate':
          if (!amountInput) return undefined
          return encodeFunctionData({ abi: FUND_VAULT_ABI, functionName: 'deallocate', args: [addr, parseUnits(amountInput, currentDecimals)] })
      }
    } catch {
      return undefined
    }
  }, [activeAction, strategyInput, amountInput, currentDecimals])

  // ── Timelock status query ────────────────────────────────────────────────
  const isTimelockable = activeAction ? TIMELOCKABLE_ACTIONS.has(activeAction) : false
  const timelockStatus = useTimelockStatus(
    isTimelockable ? fundVaultAddress : undefined,
    isTimelockable ? encodedCalldata : undefined,
  )

  const timelockDuration = timelockStatus.data?.duration ?? 0n
  const isTimelocked = isTimelockable && timelockDuration > 0n
  const isPending = timelockStatus.data?.isPending ?? false
  const isReady = timelockStatus.data?.isReady ?? false
  const executableAt = timelockStatus.data?.executableAt ?? 0n

  // Determine which flow is active
  const needsSubmit = isTimelocked && !isPending
  const isWaiting = isTimelocked && isPending && !isReady
  const canExecute = isTimelocked && isPending && isReady

  // ── Pending FundVault timelock operations ────────────────────────────────
  const pendingOps = useFundVaultPending(fundVaultAddress)

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handlePropose() {
    if (!encodedCalldata) return
    proposeTx.reset()
    proposeTx.mutate({ to: fundVaultAddress, data: encodedCalldata })
  }

  function handleSubmitTimelock() {
    if (!encodedCalldata) return
    timelockProposeTx.reset()
    const calldata = encodeFunctionData({
      abi: HA_BASE_ABI,
      functionName: 'submit',
      args: [encodedCalldata],
    })
    timelockProposeTx.mutate({ to: fundVaultAddress, data: calldata })
  }

  const needsAmount = activeAction === 'setStrategyCap' || activeAction === 'allocate' || activeAction === 'deallocate'
  const needsAssetSelect = needsAmount || activeAction === 'removeStrategy'
  const needsStrategySelect = activeAction === 'removeStrategy' || activeAction === 'setStrategyCap' || activeAction === 'allocate' || activeAction === 'deallocate'
  const needsStrategyInput = activeAction === 'addStrategy'

  // ── Button config ────────────────────────────────────────────────────────

  function getButtonConfig(): { label: string; disabled: boolean; className: string; onClick: () => void } {
    const base = 'rounded-md px-4 py-2 text-sm font-medium transition-colors'
    const disabledStyle = `${base} bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500`

    // Timelock submit flow — uses admin Safe
    if (needsSubmit) {
      if (!isConnected) return { label: 'Connect wallet', disabled: true, className: disabledStyle, onClick: () => {} }
      if (isWrongChain) return { label: 'Wrong network', disabled: true, className: `${base} bg-amber-100 text-amber-600 cursor-not-allowed`, onClick: () => {} }
      if (!timelockProposerCheck.isSafeOwner) return { label: 'Not a Timelock Proposer Safe owner', disabled: true, className: disabledStyle, onClick: () => {} }
      if (!timelockProposerCheck.hasRole) return { label: 'Safe lacks TIMELOCK_PROPOSER_ROLE', disabled: true, className: disabledStyle, onClick: () => {} }
      if (timelockProposeTx.isPending) return { label: 'Confirm in wallet...', disabled: true, className: `${base} bg-amber-600 text-white`, onClick: () => {} }
      if (timelockProposeTx.isSuccess) return { label: 'Submitted', disabled: true, className: `${base} bg-green-600 text-white cursor-not-allowed`, onClick: () => {} }
      if (timelockProposeTx.isError) return { label: 'Failed - Retry', disabled: false, className: `${base} bg-red-600 text-white hover:bg-red-700`, onClick: handleSubmitTimelock }
      return { label: 'Submit Timelock via Safe', disabled: !encodedCalldata, className: encodedCalldata ? `${base} bg-amber-600 text-white hover:bg-amber-700` : disabledStyle, onClick: handleSubmitTimelock }
    }

    // Waiting for timelock — button disabled
    if (isWaiting) {
      return { label: 'Waiting for timelock...', disabled: true, className: disabledStyle, onClick: () => {} }
    }

    // Execute or direct propose — uses curator Safe
    if (!isConnected) return { label: 'Connect wallet', disabled: true, className: disabledStyle, onClick: () => {} }
    if (isWrongChain) return { label: 'Wrong network', disabled: true, className: `${base} bg-amber-100 text-amber-600 cursor-not-allowed`, onClick: () => {} }
    if (!isSafeOwner) return { label: 'Not a Safe owner', disabled: true, className: disabledStyle, onClick: () => {} }
    if (!hasRole) return { label: 'Safe lacks CURATOR_ROLE', disabled: true, className: disabledStyle, onClick: () => {} }
    if (proposeTx.isPending) return { label: 'Confirm in wallet...', disabled: true, className: `${base} bg-blue-600 text-white`, onClick: () => {} }
    if (proposeTx.isSuccess) return { label: canExecute ? 'Executed' : 'Proposed', disabled: true, className: `${base} bg-green-600 text-white cursor-not-allowed`, onClick: () => {} }
    if (proposeTx.isError) return { label: 'Failed - Retry', disabled: false, className: `${base} bg-red-600 text-white hover:bg-red-700`, onClick: handlePropose }

    const label = canExecute ? 'Execute via Safe' : 'Propose via Safe'
    const color = canExecute ? `${base} bg-green-600 text-white hover:bg-green-700` : `${base} bg-blue-600 text-white hover:bg-blue-700`
    return { label, disabled: !encodedCalldata, className: encodedCalldata ? color : disabledStyle, onClick: handlePropose }
  }

  const btnConfig = getButtonConfig()

  // Active proposer for showing status feedback
  const activeProposer = needsSubmit ? timelockProposeTx : proposeTx

  return (
    <div className="space-y-8">
      {/* ── Asset Overview Cards ────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-white">FundVault Capital Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.assets.map((a) => (
            <AssetCard key={a.asset} asset={a} />
          ))}
        </div>
      </section>

      {/* ── Strategies per Asset ────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-white">Whitelisted Strategies</h2>
        {data.assets.map((a) => (
          <AssetStrategiesTable key={a.asset} asset={a} />
        ))}
        {data.assets.length === 0 && (
          <p className="text-sm text-neutral-500">No registered assets found.</p>
        )}
      </section>

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-white">Strategy Actions</h2>
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          {/* Action tabs */}
          <div className="mb-6 flex flex-wrap gap-2">
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((action) => (
              <button
                key={action}
                onClick={() => {
                  setActiveAction(activeAction === action ? null : action)
                  setStrategyInput('')
                  setAmountInput('')
                  proposeTx.reset()
                  timelockProposeTx.reset()
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeAction === action
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              >
                {ACTION_LABELS[action]}
              </button>
            ))}
          </div>

          {/* Form */}
          {activeAction && (
            <div className="space-y-4">
              {/* Asset selector */}
              {needsAssetSelect && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {needsAmount ? 'Asset context (for decimals)' : 'Asset'}
                  </label>
                  <select
                    value={selectedAsset}
                    onChange={(e) => {
                      setSelectedAsset(e.target.value)
                      setStrategyInput('')
                      setAmountInput('')
                      proposeTx.reset()
                      timelockProposeTx.reset()
                    }}
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  >
                    {data.assets.map((a) => (
                      <option key={a.asset} value={a.asset}>
                        {a.symbol} ({truncateAddress(a.asset)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Strategy address input (for addStrategy) */}
              {needsStrategyInput && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Strategy address
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={strategyInput}
                    onChange={(e) => setStrategyInput(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              )}

              {/* Strategy selector (for remove/cap/allocate/deallocate) */}
              {needsStrategySelect && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Strategy
                  </label>
                  <select
                    value={strategyInput}
                    onChange={(e) => setStrategyInput(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="">Select a strategy...</option>
                    {allStrategies.map((s) => {
                      const meta = assetMetadata?.[s.asset]
                      return (
                        <option key={s.address} value={s.address}>
                          {truncateAddress(s.address)} - {s.description || 'No description'} ({meta?.symbol ?? '?'})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* Amount input */}
              {needsAmount && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Amount ({currentAssetSummary?.symbol ?? 'tokens'})
                  </label>
                  <input
                    type="text"
                    placeholder="0.0"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              )}

              {/* Timelock status banner */}
              {encodedCalldata && isTimelockable && (
                <TimelockBanner
                  isLoading={timelockStatus.isLoading}
                  isTimelocked={isTimelocked}
                  needsSubmit={needsSubmit}
                  isWaiting={isWaiting}
                  canExecute={canExecute}
                  durationSeconds={Number(timelockDuration)}
                  executableAtSeconds={Number(executableAt)}
                  onRefresh={() => timelockStatus.refetch()}
                />
              )}

              {/* Submit */}
              <div className="flex items-center gap-3">
                <button
                  onClick={btnConfig.onClick}
                  disabled={btnConfig.disabled}
                  className={btnConfig.className}
                >
                  {btnConfig.label}
                </button>

                {activeProposer.isPending && (
                  <svg className="h-4 w-4 animate-spin text-neutral-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}

                {activeProposer.isSuccess && (
                  <Link
                    href="/safe-transactions"
                    className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View pending transactions
                  </Link>
                )}

                {activeProposer.error && (
                  <span
                    className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help"
                    title={activeProposer.error.message}
                  >
                    {activeProposer.error.message}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
      {/* ── Pending Timelock Operations ────────────────────────────────────── */}
      {(pendingOps.data?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-white">
            Pending Timelock Operations
          </h2>
          <div className="space-y-3">
            {pendingOps.data!.map((op, i) => (
              <PendingOpCard
                key={`${op.selector}-${i}`}
                op={op}
                fundVaultAddress={fundVaultAddress}
                curatorSafeAddress={safeAddress}
                isSafeOwner={isSafeOwner}
                hasRole={hasRole}
                isConnected={isConnected}
                isWrongChain={isWrongChain}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Pending Operation Card ─────────────────────────────────────────────────

function decodeOpCalldata(data: `0x${string}`): { fnName: string; args: string } {
  try {
    const { functionName, args } = decodeFunctionData({ abi: FUND_VAULT_ABI, data })
    const argsStr = args
      ? (args as readonly unknown[]).map((a) => String(a)).join(', ')
      : ''
    return { fnName: functionName, args: argsStr }
  } catch {
    // Fallback: match selector to TIMELOCKED_FUNCTIONS
    const sel = data.slice(0, 10).toLowerCase()
    const fn = TIMELOCKED_FUNCTIONS.find((f) => f.selector.toLowerCase() === sel)
    return { fnName: fn?.name ?? 'unknown', args: data.slice(10, 30) + '...' }
  }
}

function PendingOpCard({
  op,
  fundVaultAddress,
  curatorSafeAddress,
  isSafeOwner,
  hasRole,
  isConnected,
  isWrongChain,
}: {
  op: PendingOp
  fundVaultAddress: `0x${string}`
  curatorSafeAddress: `0x${string}` | undefined
  isSafeOwner: boolean
  hasRole: boolean
  isConnected: boolean
  isWrongChain: boolean
}) {
  const proposeTx = useProposeSafeTransaction(curatorSafeAddress)
  const countdown = useCountdown(Number(op.executableAt))
  const decoded = useMemo(() => decodeOpCalldata(op.data), [op.data])

  function handleExecute() {
    proposeTx.reset()
    // Execute by calling the function directly — the contract checks the timelock
    proposeTx.mutate({ to: fundVaultAddress, data: op.data })
  }

  const base = 'rounded-md px-3 py-1.5 text-xs font-medium transition-colors'
  const disabledStyle = `${base} bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500`

  let btnLabel: string
  let btnDisabled = false
  let btnClass = `${base} bg-green-600 text-white hover:bg-green-700`

  if (!op.isReady) {
    btnLabel = countdown ?? 'Waiting...'
    btnDisabled = true
    btnClass = disabledStyle
  } else if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true; btnClass = disabledStyle
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true; btnClass = `${base} bg-amber-100 text-amber-600 cursor-not-allowed`
  } else if (!isSafeOwner) {
    btnLabel = 'Not owner'; btnDisabled = true; btnClass = disabledStyle
  } else if (!hasRole) {
    btnLabel = 'No role'; btnDisabled = true; btnClass = disabledStyle
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm...'; btnDisabled = true
  } else if (proposeTx.isSuccess) {
    btnLabel = 'Proposed'; btnDisabled = true; btnClass = `${base} bg-green-600 text-white cursor-not-allowed`
  } else if (proposeTx.isError) {
    btnLabel = 'Retry'; btnClass = `${base} bg-red-600 text-white hover:bg-red-700`
  } else {
    btnLabel = 'Execute via Safe'
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">
              {decoded.fnName}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              op.isReady
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            }`}>
              {op.isReady ? 'Ready' : countdown ?? 'Waiting'}
            </span>
          </div>
          <p className="truncate font-mono text-xs text-neutral-400" title={decoded.args}>
            {decoded.args}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {proposeTx.isSuccess && (
            <Link href="/safe-transactions" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              View
            </Link>
          )}
          {proposeTx.error && (
            <span className="max-w-[200px] truncate text-xs text-red-600 cursor-help" title={proposeTx.error.message}>
              {proposeTx.error.message}
            </span>
          )}
          <button
            onClick={handleExecute}
            disabled={btnDisabled}
            className={btnClass}
          >
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Timelock Banner ────────────────────────────────────────────────────────

function TimelockBanner({
  isLoading,
  isTimelocked,
  needsSubmit,
  isWaiting,
  canExecute,
  durationSeconds,
  executableAtSeconds,
  onRefresh,
}: {
  isLoading: boolean
  isTimelocked: boolean
  needsSubmit: boolean
  isWaiting: boolean
  canExecute: boolean
  durationSeconds: number
  executableAtSeconds: number
  onRefresh: () => void
}) {
  const countdown = useCountdown(isWaiting ? executableAtSeconds : undefined)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
        <svg className="h-4 w-4 animate-spin text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm text-neutral-500">Checking timelock status...</span>
      </div>
    )
  }

  if (!isTimelocked) return null

  if (needsSubmit) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          Timelock required ({formatDuration(durationSeconds)} delay)
        </p>
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          This action must be submitted to the timelock first. After the delay passes, you can return to execute it.
        </p>
      </div>
    )
  }

  if (isWaiting) {
    return (
      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Timelock submitted — waiting for delay
            </p>
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              Executable in <span className="font-mono font-medium">{countdown}</span>
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/40"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  if (canExecute) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-900/20">
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          Timelock passed — ready to execute
        </p>
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">
          The timelock delay has elapsed. You can now execute this operation via the Curator Safe.
        </p>
      </div>
    )
  }

  return null
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: AssetStrategySummary }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-neutral-900 dark:text-white">{asset.symbol}</span>
        <span className="text-xs text-neutral-400 font-mono">{truncateAddress(asset.asset)}</span>
      </div>
      <div className="space-y-2 text-sm">
        <Row label="Idle (FundVault)" value={formatTokenAmount(asset.idleAssets, asset.decimals)} symbol={asset.symbol} />
        <Row label="Deployed" value={formatTokenAmount(asset.deployedAssets, asset.decimals)} symbol={asset.symbol} />
        <Row label="Total Managed" value={formatTokenAmount(asset.totalManagedAssets, asset.decimals)} symbol={asset.symbol} highlight />
        <div className="pt-1 text-xs text-neutral-400">
          {asset.strategies.length} strateg{asset.strategies.length === 1 ? 'y' : 'ies'}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, symbol, highlight }: { label: string; value: string; symbol: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={highlight ? 'font-medium text-neutral-900 dark:text-white' : 'text-neutral-700 dark:text-neutral-300'}>
        {value} <span className="text-neutral-400 text-xs">{symbol}</span>
      </span>
    </div>
  )
}

function AssetStrategiesTable({ asset }: { asset: AssetStrategySummary }) {
  if (asset.strategies.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {asset.symbol} Strategies
        </h3>
        <p className="text-sm text-neutral-400">No strategies registered.</p>
      </div>
    )
  }

  return (
    <div className="mb-6 overflow-x-auto">
      <h3 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {asset.symbol} Strategies
      </h3>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-700">
            <th className="pb-2 pr-4 font-medium text-neutral-500 dark:text-neutral-400">Address</th>
            <th className="pb-2 pr-4 font-medium text-neutral-500 dark:text-neutral-400">Description</th>
            <th className="pb-2 pr-4 text-right font-medium text-neutral-500 dark:text-neutral-400">Balance</th>
            <th className="pb-2 pr-4 text-right font-medium text-neutral-500 dark:text-neutral-400">Cap</th>
            <th className="pb-2 pr-4 text-right font-medium text-neutral-500 dark:text-neutral-400">Utilization</th>
            <th className="pb-2 pr-4 text-right font-medium text-neutral-500 dark:text-neutral-400">Total In</th>
            <th className="pb-2 text-right font-medium text-neutral-500 dark:text-neutral-400">Total Out</th>
          </tr>
        </thead>
        <tbody>
          {asset.strategies.map((s) => (
            <StrategyRow key={s.address} strategy={s} decimals={asset.decimals} symbol={asset.symbol} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StrategyRow({ strategy, decimals, symbol }: { strategy: StrategyData; decimals: number; symbol: string }) {
  const balance = BigInt(strategy.totalAssets)
  const cap = BigInt(strategy.cap)
  const utilization = cap > 0n ? Number((balance * 10000n) / cap) / 100 : 0

  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-800">
      <td className="py-2 pr-4 font-mono text-xs text-neutral-700 dark:text-neutral-300">
        {truncateAddress(strategy.address)}
      </td>
      <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
        {strategy.description || '-'}
      </td>
      <td className="py-2 pr-4 text-right text-neutral-900 dark:text-white">
        {formatTokenAmount(strategy.totalAssets, decimals)}
        <span className="ml-1 text-xs text-neutral-400">{symbol}</span>
      </td>
      <td className="py-2 pr-4 text-right text-neutral-700 dark:text-neutral-300">
        {cap === 0n ? (
          <span className="text-red-500">Blocked</span>
        ) : (
          <>
            {formatTokenAmount(strategy.cap, decimals)}
            <span className="ml-1 text-xs text-neutral-400">{symbol}</span>
          </>
        )}
      </td>
      <td className="py-2 pr-4 text-right">
        <span
          className={
            utilization >= 90
              ? 'text-red-600 dark:text-red-400'
              : utilization >= 70
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-green-600 dark:text-green-400'
          }
        >
          {utilization.toFixed(1)}%
        </span>
      </td>
      <td className="py-2 pr-4 text-right text-neutral-500 dark:text-neutral-400 text-xs">
        {formatTokenAmount(strategy.totalAllocated, decimals)}
      </td>
      <td className="py-2 text-right text-neutral-500 dark:text-neutral-400 text-xs">
        {formatTokenAmount(strategy.totalDeallocated, decimals)}
      </td>
    </tr>
  )
}
