'use client'

import { Fragment, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAccount, useReadContract } from 'wagmi'
import { encodeFunctionData, parseUnits, getAddress } from 'viem'

import { HA_PORTFOLIO_MARGIN_ABI, HA_BASE_ABI } from '@/lib/abis'
import { findAdapter } from '@/lib/strategies/adapters'
import type { StrategyOperation, StrategyOperationInput } from '@/lib/strategies/adapters'
import { useTokenInfo, evmToWei } from '@/lib/hypercore/token-info'
import { useProposeSafeTransaction, useRoleCheck } from '@/lib/safe/hooks'
import { useTimelockStatus } from '@/lib/hooks/use-timelock-status'
import { useCountdown } from '@/lib/hooks/use-countdown'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import Tooltip from '@/app/components/Tooltip'
import type { StrategyPageData } from '@/lib/strategy-reader'

type Props = { data: StrategyPageData }

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

// ─── NAV Breakdown ───────────────────────────────────────────────────────────

function NavBreakdown({
  evmBalance,
  spotBalance,
  lendingBalance,
  decimals,
  symbol,
}: {
  evmBalance: string
  spotBalance: string
  lendingBalance: string
  decimals: number
  symbol: string
}) {
  const evm = BigInt(evmBalance)
  const spot = BigInt(spotBalance)
  const lending = BigInt(lendingBalance)
  const sum = evm + spot + lending

  function pct(part: bigint): string {
    if (sum === 0n) return '0.0%'
    return `${(Number((part * 10000n) / sum) / 100).toFixed(1)}%`
  }

  const rows: { label: string; value: string; share: string; dot: string; tip: string }[] = [
    {
      label: 'HyperEVM (ERC20)',
      value: formatTokenAmount(evmBalance, decimals),
      share: pct(evm),
      dot: 'bg-neutral-400',
      tip: 'Asset balance held by the strategy contract on HyperEVM right now. Capital sits here briefly between bridge events.',
    },
    {
      label: 'HyperCore Spot',
      value: formatTokenAmount(spotBalance, decimals),
      share: pct(spot),
      dot: 'bg-blue-500',
      tip: 'Asset balance on HyperCore spot — typically transient, between a bridge and a supply step.',
    },
    {
      label: 'HyperCore Lending',
      value: formatTokenAmount(lendingBalance, decimals),
      share: pct(lending),
      dot: 'bg-purple-500',
      tip: 'Active supply position in the HyperCore Portfolio Margin lending market — where capital earns yield.',
    },
  ]

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/40">
      <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
        <Tooltip
          text="Where this strategy's NAV currently lives. spotBalance() and lendingBalance() are read from the strategy contract; HyperEVM is the ERC-20 balance held on this chain."
          width="w-72"
        >
          NAV breakdown
        </Tooltip>
      </p>
      <div className="grid w-fit grid-cols-[auto_auto_auto] items-center gap-x-4 gap-y-1.5 text-xs">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <span className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
              <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} />
              <Tooltip text={row.tip} width="w-64">
                <span>{row.label}</span>
              </Tooltip>
            </span>
            <span className="text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-200">
              {row.value} <span className="text-neutral-400">{symbol}</span>
            </span>
            <span className="text-right font-mono tabular-nums text-neutral-400">{row.share}</span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// ─── Timelock Banner ─────────────────────────────────────────────────────────

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
          Submit to the timelock first. After the delay passes you can return to execute.
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
          The delay has elapsed. You can now execute this operation via the Curator Safe.
        </p>
      </div>
    )
  }

  return null
}

// ─── Input Field ──────────────────────────────────────────────────────────────

function OperationInput({
  input,
  value,
  assetSymbol,
  coreWeiPreview,
  tokenInfoLoading,
  tokenInfoError,
  onChange,
}: {
  input: StrategyOperationInput
  value: string
  assetSymbol: string
  coreWeiPreview: bigint | undefined
  tokenInfoLoading: boolean
  tokenInfoError: Error | null
  onChange: (val: string) => void
}) {
  const isDisabled =
    (input.kind === 'core-wei-from-evm' && tokenInfoLoading) ||
    (input.kind === 'core-wei-from-evm' && !!tokenInfoError)

  const showZeroNote = !!input.zeroMeaning && value === '0'
  const showAmountSymbol = input.kind !== 'string' && input.kind !== 'address' && input.kind !== 'bool'

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {input.label}
        {showAmountSymbol && (
          <span className="ml-1 text-xs font-normal text-neutral-400">({assetSymbol})</span>
        )}
      </label>

      {input.kind === 'string' ? (
        <input
          type="text"
          placeholder={input.placeholder ?? ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
        />
      ) : input.kind === 'bool' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
        >
          <option value="">Select...</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          placeholder={input.placeholder ?? '0.0'}
          value={value}
          disabled={isDisabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
        />
      )}

      {input.helperText && (
        <p className="mt-1 text-xs text-neutral-500">{input.helperText}</p>
      )}

      {showZeroNote && (
        <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{input.zeroMeaning}</p>
      )}

      {input.kind === 'core-wei-from-evm' && tokenInfoLoading && (
        <p className="mt-1 text-xs text-neutral-400">Loading HyperCore token info...</p>
      )}

      {input.kind === 'core-wei-from-evm' && !tokenInfoError && coreWeiPreview !== undefined && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          HyperCore wei: <span className="font-mono">{coreWeiPreview.toString()}</span>
        </p>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StrategyOperations({ data }: Props) {
  const { isConnected, chainId } = useAccount()

  const [selectedAddress, setSelectedAddress] = useState('')
  const [activeOpName, setActiveOpName] = useState<string | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})

  const isWrongChain = isConnected && chainId !== 999

  // Derive selected strategy + asset context
  const selectedStrategy = data.assets
    .flatMap((a) => a.strategies)
    .find((s) => s.address === selectedAddress)

  const assetSummary = selectedStrategy
    ? data.assets.find((a) => a.asset === selectedStrategy.asset)
    : undefined

  const assetDecimals = assetSummary?.decimals ?? 18
  const assetSymbol = assetSummary?.symbol ?? '?'

  // Find adapter by description
  const adapter = selectedStrategy ? findAdapter(selectedStrategy.description) : undefined

  // Safe role hooks (curator + timelock proposer)
  const { safeAddress, isSafeOwner, hasRole } = useRoleCheck('curator')
  const proposeTx = useProposeSafeTransaction(safeAddress)
  const timelockProposerCheck = useRoleCheck('timelock_proposer')
  const timelockProposeTx = useProposeSafeTransaction(timelockProposerCheck.safeAddress)

  // Secondary probe: read coreTokenIndex from strategy (HaPortfolioMargin only)
  const strategyAddress = selectedAddress as `0x${string}` | undefined
  const isHaPortfolioMargin = adapter?.type === 'HaPortfolioMargin'

  const { data: coreTokenIndexRaw } = useReadContract({
    address: strategyAddress,
    abi: HA_PORTFOLIO_MARGIN_ABI,
    functionName: 'coreTokenIndex',
    query: { enabled: isHaPortfolioMargin && Boolean(strategyAddress) },
  })

  const coreTokenIndex = coreTokenIndexRaw !== undefined ? BigInt(coreTokenIndexRaw) : undefined

  // TokenInfo for core-wei-from-evm conversion
  const {
    data: tokenInfo,
    isLoading: tokenInfoLoading,
    error: tokenInfoError,
  } = useTokenInfo(coreTokenIndex)

  // Active operation
  const operation: StrategyOperation | undefined =
    adapter?.operations.find((op) => op.functionName === activeOpName)

  // Encode calldata
  const encodedCalldata = useMemo((): `0x${string}` | undefined => {
    if (!operation || !adapter || !selectedAddress) return undefined
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args: any[] = operation.inputs.map((input) => {
        const raw = inputValues[input.name] ?? ''
        if (raw === '') throw new Error('empty input')

        switch (input.kind) {
          case 'evm-decimals':
            return parseUnits(raw, assetDecimals)
          case 'core-wei-from-evm': {
            if (!tokenInfo) throw new Error('token info not ready')
            return evmToWei(tokenInfo, parseUnits(raw, assetDecimals))
          }
          case 'address':
            return getAddress(raw)
          case 'raw-uint':
            return BigInt(raw)
          case 'string':
            return raw
          case 'bool':
            if (raw !== 'true' && raw !== 'false') throw new Error('invalid bool')
            return raw === 'true'
        }
      })

      return encodeFunctionData({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        abi: adapter.abi as any,
        functionName: operation.functionName as never,
        args,
      })
    } catch {
      return undefined
    }
  }, [operation, adapter, selectedAddress, inputValues, assetDecimals, tokenInfo])

  // Core-wei preview for pull form
  const coreWeiPreview = useMemo((): bigint | undefined => {
    if (!tokenInfo || !operation) return undefined
    const coreInput = operation.inputs.find((i) => i.kind === 'core-wei-from-evm')
    if (!coreInput) return undefined
    const raw = inputValues[coreInput.name] ?? ''
    if (!raw) return undefined
    try {
      return evmToWei(tokenInfo, parseUnits(raw, assetDecimals))
    } catch {
      return undefined
    }
  }, [tokenInfo, operation, inputValues, assetDecimals])

  // Timelock
  const timelockStatus = useTimelockStatus(
    selectedAddress ? (selectedAddress as `0x${string}`) : undefined,
    encodedCalldata,
  )

  const timelockDuration = timelockStatus.data?.duration ?? 0n
  const isTimelocked = timelockDuration > 0n
  const isPending = timelockStatus.data?.isPending ?? false
  const isReady = timelockStatus.data?.isReady ?? false
  const executableAt = timelockStatus.data?.executableAt ?? 0n

  const needsSubmit = isTimelocked && !isPending
  const isWaiting = isTimelocked && isPending && !isReady
  const canExecute = isTimelocked && isPending && isReady

  function handlePropose() {
    if (!encodedCalldata || !selectedAddress) return
    proposeTx.reset()
    proposeTx.mutate({ to: selectedAddress as `0x${string}`, data: encodedCalldata })
  }

  function handleSubmitTimelock() {
    if (!encodedCalldata || !selectedAddress) return
    timelockProposeTx.reset()
    const calldata = encodeFunctionData({
      abi: HA_BASE_ABI,
      functionName: 'submit',
      args: [encodedCalldata],
    })
    timelockProposeTx.mutate({ to: selectedAddress as `0x${string}`, data: calldata })
  }

  // Disable propose if core-wei conversion is unavailable
  const hasCoreWeiInput = operation?.inputs.some((i) => i.kind === 'core-wei-from-evm') ?? false
  const conversionUnavailable = hasCoreWeiInput && (!!tokenInfoError || (!tokenInfo && !tokenInfoLoading))
  const isDataReady = !!encodedCalldata && !conversionUnavailable

  const activeProposer = needsSubmit ? timelockProposeTx : proposeTx

  function getButtonConfig() {
    const base = 'rounded-md px-4 py-2 text-sm font-medium transition-colors'
    const disabledStyle = `${base} bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500`

    if (needsSubmit) {
      if (!isConnected) return { label: 'Connect wallet', disabled: true, className: disabledStyle, onClick: () => {} }
      if (isWrongChain) return { label: 'Wrong network', disabled: true, className: `${base} bg-amber-100 text-amber-600 cursor-not-allowed`, onClick: () => {} }
      if (!timelockProposerCheck.isSafeOwner) return { label: 'Not a Timelock Proposer Safe owner', disabled: true, className: disabledStyle, onClick: () => {} }
      if (!timelockProposerCheck.hasRole) return { label: 'Safe lacks TIMELOCK_PROPOSER_ROLE', disabled: true, className: disabledStyle, onClick: () => {} }
      if (timelockProposeTx.isPending) return { label: 'Confirm in wallet...', disabled: true, className: `${base} bg-amber-600 text-white`, onClick: () => {} }
      if (timelockProposeTx.isSuccess) return { label: 'Submitted', disabled: true, className: `${base} bg-green-600 text-white cursor-not-allowed`, onClick: () => {} }
      if (timelockProposeTx.isError) return { label: 'Failed — Retry', disabled: false, className: `${base} bg-red-600 text-white hover:bg-red-700`, onClick: handleSubmitTimelock }
      return {
        label: 'Submit Timelock via Safe',
        disabled: !isDataReady,
        className: isDataReady ? `${base} bg-amber-600 text-white hover:bg-amber-700` : disabledStyle,
        onClick: handleSubmitTimelock,
      }
    }

    if (isWaiting) return { label: 'Waiting for timelock...', disabled: true, className: disabledStyle, onClick: () => {} }

    if (!isConnected) return { label: 'Connect wallet', disabled: true, className: disabledStyle, onClick: () => {} }
    if (isWrongChain) return { label: 'Wrong network', disabled: true, className: `${base} bg-amber-100 text-amber-600 cursor-not-allowed`, onClick: () => {} }
    if (!isSafeOwner) return { label: 'Not a Safe owner', disabled: true, className: disabledStyle, onClick: () => {} }
    if (!hasRole) return { label: 'Safe lacks CURATOR_ROLE', disabled: true, className: disabledStyle, onClick: () => {} }
    if (proposeTx.isPending) return { label: 'Confirm in wallet...', disabled: true, className: `${base} bg-blue-600 text-white`, onClick: () => {} }
    if (proposeTx.isSuccess) return { label: canExecute ? 'Executed' : 'Proposed', disabled: true, className: `${base} bg-green-600 text-white cursor-not-allowed`, onClick: () => {} }
    if (proposeTx.isError) return { label: 'Failed — Retry', disabled: false, className: `${base} bg-red-600 text-white hover:bg-red-700`, onClick: handlePropose }

    const label = canExecute ? 'Execute via Safe' : 'Propose via Safe'
    const color = canExecute
      ? `${base} bg-green-600 text-white hover:bg-green-700`
      : `${base} bg-blue-600 text-white hover:bg-blue-700`
    return { label, disabled: !isDataReady, className: isDataReady ? color : disabledStyle, onClick: handlePropose }
  }

  const btnConfig = getButtonConfig()

  function resetForm() {
    setActiveOpName(null)
    setInputValues({})
    proposeTx.reset()
    timelockProposeTx.reset()
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-medium text-neutral-900 dark:text-white">Strategy Operations</h2>
      <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900 space-y-6">

        {/* Strategy selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Target Strategy
          </label>
          <select
            value={selectedAddress}
            onChange={(e) => {
              setSelectedAddress(e.target.value)
              resetForm()
            }}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          >
            <option value="">Select a strategy...</option>
            {data.assets.map((asset) =>
              asset.strategies.map((s) => (
                <option key={s.address} value={s.address}>
                  {asset.symbol}: {s.description || truncateAddress(s.address)}
                </option>
              )),
            )}
          </select>
        </div>

        {/* Placeholder when nothing is selected */}
        {!selectedStrategy && (
          <p className="text-sm text-neutral-400">Select a strategy above to see available operations.</p>
        )}

        {/* No adapter for this strategy */}
        {selectedStrategy && !adapter && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Operations not available</p>
            <p className="mt-1 text-xs text-neutral-500">
              Strategy type{' '}
              <span className="font-mono">&quot;{selectedStrategy.description || 'unknown'}&quot;</span>{' '}
              is not yet supported. Add an adapter in{' '}
              <span className="font-mono">lib/strategies/</span> to enable operations.
            </p>
          </div>
        )}

        {/* Adapter found */}
        {selectedStrategy && adapter && (
          <>
            {/* Strategy identity row */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {adapter.type}
              </span>
              <span className="font-mono">{truncateAddress(selectedStrategy.address)}</span>
              <span>{selectedStrategy.description}</span>
            </div>

            {/* NAV breakdown — HaPortfolioMargin only */}
            {selectedStrategy.spotBalance !== undefined &&
              selectedStrategy.lendingBalance !== undefined && (
                <NavBreakdown
                  evmBalance={selectedStrategy.evmBalance}
                  spotBalance={selectedStrategy.spotBalance}
                  lendingBalance={selectedStrategy.lendingBalance}
                  decimals={assetDecimals}
                  symbol={assetSymbol}
                />
              )}

            {/* Operation tabs */}
            <div className="flex flex-wrap gap-2">
              {adapter.operations.map((op) => (
                <button
                  key={op.functionName}
                  onClick={() => {
                    if (activeOpName === op.functionName) {
                      resetForm()
                    } else {
                      setActiveOpName(op.functionName)
                      setInputValues({})
                      proposeTx.reset()
                      timelockProposeTx.reset()
                    }
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeOpName === op.functionName
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>

            {/* Active operation form */}
            {operation && (
              <div className="space-y-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{operation.blurb}</p>

                {/* Warning */}
                {operation.warning && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
                    <p className="text-xs text-amber-700 dark:text-amber-300">{operation.warning}</p>
                  </div>
                )}

                {/* Token info error (affects core-wei-from-evm inputs) */}
                {hasCoreWeiInput && tokenInfoError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
                    <p className="text-xs font-medium text-red-700 dark:text-red-300">
                      Could not load HyperCore token info
                    </p>
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Cannot safely convert to HyperCore wei. The propose button is disabled. Contact the dev team.
                    </p>
                  </div>
                )}

                {/* Inputs */}
                {operation.inputs.map((input) => (
                  <OperationInput
                    key={input.name}
                    input={input}
                    value={inputValues[input.name] ?? ''}
                    assetSymbol={assetSymbol}
                    coreWeiPreview={coreWeiPreview}
                    tokenInfoLoading={tokenInfoLoading}
                    tokenInfoError={tokenInfoError as Error | null}
                    onChange={(val) => setInputValues((prev) => ({ ...prev, [input.name]: val }))}
                  />
                ))}

                {/* Timelock banner */}
                {encodedCalldata && (
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

                {/* Submit row */}
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
                    <Link href="/safe-transactions" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
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
          </>
        )}
      </div>
    </section>
  )
}
