'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { encodeFunctionData, getAddress, isAddress, parseUnits } from 'viem'
import { FUND_CONTRACT_ABI, PERP_NAV_CONTRACT_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { buildV2SafeDropdownOptions, resolveV2SafeAddressFromLabel } from '@/lib/safe/v2-safes'
import { useVaultConfig } from '@/lib/vault-context'
import { safeTransactionsHref } from '@/lib/resolve-vault'
import { getFundContractAddress, getPerpNavContractAddress } from '@/lib/nav-contract-targets'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import { V2_ENCODED_ROLE_HASHES } from '@/lib/v2-role-hashes'
import type { NavPageData } from '@/lib/nav-reader'
import HarvestManagementFeeV2Section from './HarvestManagementFeeV2Section'
import HarvestPerformanceFeeV2Section from './HarvestPerformanceFeeV2Section'
import RefreshButton from '@/app/withdrawals/components/RefreshButton'
import { V2_AUTO_REFRESH_MS } from '@/lib/v2-auto-refresh'
const WAD_DECIMALS = 18

type Props = { data: NavPageData }
type ExecMode = 'eoa' | 'safe'
type SafeOption = { label: string; address: string }
type NavAction = 'sync' | 'update' | 'harvestMgmt' | 'harvestPerf'

type ExecuteAsScope = 'sync' | 'fund'

type ExecuteAsSectionProps = {
  scope: ExecuteAsScope
  /** Unique id when multiple Execute as blocks share the same scope on one page */
  instanceId?: string
  mode: ExecMode
  onModeChange: (mode: ExecMode) => void
  walletAddress?: string
  walletHasFundAdmin?: boolean
  walletHasPerpAdmin?: boolean
  safeOptions: SafeOption[]
  safeLabel: string
  onSafeLabelChange: (label: string) => void
  isSafeOwner: boolean
  safeHasFundAdmin?: boolean
  safeHasPerpAdmin?: boolean
}

function ExecuteAsSection({
  scope,
  instanceId = 'default',
  mode,
  onModeChange,
  walletAddress,
  walletHasFundAdmin,
  walletHasPerpAdmin,
  safeOptions,
  safeLabel,
  onSafeLabelChange,
  isSafeOwner,
  safeHasFundAdmin,
  safeHasPerpAdmin,
}: ExecuteAsSectionProps) {
  const safeAddr = resolveV2SafeAddressFromLabel(safeOptions, safeLabel)
  const resolvedSafeAddr =
    safeAddr && isAddress(safeAddr) ? (getAddress(safeAddr) as `0x${string}`) : undefined
  const radioName = `nav-exec-mode-${scope}-${instanceId}`

  return (
    <div className="mb-4">
      <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Execute as</p>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="radio"
            name={radioName}
            value="eoa"
            checked={mode === 'eoa'}
            onChange={() => onModeChange('eoa')}
          />
          Connected wallet (EOA)
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="radio"
            name={radioName}
            value="safe"
            checked={mode === 'safe'}
            onChange={() => onModeChange('safe')}
          />
          Safe (propose)
        </label>
      </div>
      {mode === 'eoa' && walletAddress && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Caller: {truncateAddress(walletAddress)}
          {scope === 'sync' && (
            <>
              {' · '}
              Perp NAV ADMIN: {walletHasPerpAdmin ? 'yes' : 'no'}
            </>
          )}
          {scope === 'fund' && (
            <>
              {' · '}
              Fund ADMIN: {walletHasFundAdmin ? 'yes' : 'no'}
            </>
          )}
        </p>
      )}
      {mode === 'safe' && (
        <div className="mt-2">
          <select
            value={safeLabel}
            onChange={(e) => onSafeLabelChange(e.target.value)}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {safeOptions.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label} ({truncateAddress(s.address)})
              </option>
            ))}
          </select>
          {resolvedSafeAddr && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {isSafeOwner ? 'You are a Safe owner' : 'You are not an owner of this Safe'}
              {scope === 'sync' && (
                <>
                  {' · '}
                  Perp NAV ADMIN: {safeHasPerpAdmin ? 'yes' : 'no'}
                </>
              )}
              {scope === 'fund' && (
                <>
                  {' · '}
                  Fund ADMIN: {safeHasFundAdmin ? 'yes' : 'no'}
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function useBlockExecuteAs({
  safeOptions,
  fundContractAddress,
  perpNavAddress,
  adminRole,
  walletAddress,
  walletHasFundAdmin,
  walletHasPerpAdmin,
}: {
  safeOptions: SafeOption[]
  fundContractAddress: `0x${string}`
  perpNavAddress?: `0x${string}`
  adminRole: `0x${string}`
  walletAddress?: string
  walletHasFundAdmin?: boolean
  walletHasPerpAdmin?: boolean
}) {
  const [mode, setMode] = useState<ExecMode>('safe')
  const [safeLabel, setSafeLabel] = useState(safeOptions[0]?.label ?? '')

  const safeAddr = useMemo(() => {
    const addr = resolveV2SafeAddressFromLabel(safeOptions, safeLabel)
    return addr && isAddress(addr) ? (getAddress(addr) as `0x${string}`) : undefined
  }, [safeOptions, safeLabel])

  const { data: safeInfo } = useSafeInfo(mode === 'safe' ? safeAddr : undefined)
  const isSafeOwner = Boolean(
    walletAddress && safeInfo?.owners.some((o) => o.toLowerCase() === walletAddress.toLowerCase()),
  )

  const { data: safeHasFundAdmin } = useReadContract({
    address: fundContractAddress,
    abi: FUND_CONTRACT_ABI,
    functionName: 'hasRole',
    args: safeAddr ? [adminRole, safeAddr] : undefined,
    query: { enabled: Boolean(safeAddr) },
  })

  const { data: safeHasPerpAdmin } = useReadContract({
    address: perpNavAddress,
    abi: PERP_NAV_CONTRACT_ABI,
    functionName: 'hasRole',
    args: safeAddr && perpNavAddress ? [adminRole, safeAddr] : undefined,
    query: { enabled: Boolean(safeAddr && perpNavAddress) },
  })

  const canExecuteFund =
    mode === 'eoa' ? walletHasFundAdmin === true : isSafeOwner && safeHasFundAdmin === true

  const canExecutePerp =
    mode === 'eoa' ? walletHasPerpAdmin === true : isSafeOwner && safeHasPerpAdmin === true

  return {
    mode,
    safeLabel,
    setMode,
    setSafeLabel,
    safeAddr,
    isSafeOwner,
    safeHasFundAdmin,
    safeHasPerpAdmin,
    canExecuteFund,
    canExecutePerp,
  }
}

function formatMetric(value: bigint | undefined, loading = false) {
  if (loading) return '…'
  if (value === undefined) return '—'
  return formatTokenAmount(value.toString(), WAD_DECIMALS, 6)
}

type ActionButtonProps = {
  label: string
  disabled: boolean
  btnClass: string
  onClick: () => void
  pending: boolean
  error?: string
  success: boolean
  successLink?: { href: string; text: string }
}

function ActionButtonRow({
  label,
  disabled,
  btnClass,
  onClick,
  pending,
  error,
  success,
  successLink,
}: ActionButtonProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {error && (
        <span
          className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help"
          title={error}
        >
          {error}
        </span>
      )}
      {pending && (
        <svg
          className="h-4 w-4 animate-spin text-neutral-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {success && successLink && (
        <Link href={successLink.href} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
          {successLink.text}
        </Link>
      )}
      <div className="ml-auto">
        <button
          onClick={onClick}
          disabled={disabled}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${btnClass}`}
        >
          {label}
        </button>
      </div>
    </div>
  )
}

function buildActionButtonState(
  mode: ExecMode,
  actionName: string,
  proposeName: string,
  successLabel: string,
  opts: {
    isConnected: boolean
    isWrongChain: boolean
    canExecute: boolean
    formValid: boolean
    pending: boolean
    success: boolean
    errored: boolean
    invalidLabel?: string
  },
) {
  const idleLabel = mode === 'eoa' ? actionName : proposeName
  const blue = 'bg-blue-600 text-white hover:bg-blue-700'
  const disabled =
    'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'

  if (!opts.isConnected || opts.isWrongChain || !opts.canExecute) {
    return { label: !opts.isConnected ? 'Connect wallet' : opts.isWrongChain ? 'Wrong network' : 'Not permitted', disabled: true, btnClass: disabled }
  }
  if (!opts.formValid) {
    return {
      label: opts.invalidLabel ?? idleLabel,
      disabled: true,
      btnClass: disabled,
    }
  }
  if (opts.pending) return { label: 'Confirm in wallet…', disabled: true, btnClass: blue }
  if (opts.success) {
    return {
      label: mode === 'eoa' ? successLabel : '✓ Proposed',
      disabled: true,
      btnClass: 'bg-green-600 text-white cursor-not-allowed',
    }
  }
  if (opts.errored) return { label: 'Failed — Retry', disabled: false, btnClass: 'bg-red-600 text-white hover:bg-red-700' }
  return { label: idleLabel, disabled: false, btnClass: blue }
}

export default function NavV2Client({ data }: Props) {
  const config = useVaultConfig()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { address, isConnected, chainId } = useAccount()

  const fundContractAddress = getFundContractAddress(config)
  const perpNavAddress = getPerpNavContractAddress(config)
  const adminRole = V2_ENCODED_ROLE_HASHES.ADMIN
  const safeOptions = useMemo(() => buildV2SafeDropdownOptions(config), [config])

  const [perpDexBalanceInput, setPerpDexBalanceInput] = useState('')
  const [lastEoaAction, setLastEoaAction] = useState<NavAction | null>(null)

  const { data: walletHasFundAdmin } = useReadContract({
    address: fundContractAddress,
    abi: FUND_CONTRACT_ABI,
    functionName: 'hasRole',
    args: address ? [adminRole, address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { data: walletHasPerpAdmin } = useReadContract({
    address: perpNavAddress,
    abi: PERP_NAV_CONTRACT_ABI,
    functionName: 'hasRole',
    args: address && perpNavAddress ? [adminRole, address] : undefined,
    query: { enabled: Boolean(address && perpNavAddress) },
  })

  const blockExecBase = {
    safeOptions,
    fundContractAddress,
    perpNavAddress,
    adminRole,
    walletAddress: address,
    walletHasFundAdmin,
    walletHasPerpAdmin,
  }

  const syncExec = useBlockExecuteAs(blockExecBase)
  const updateNavExec = useBlockExecuteAs(blockExecBase)
  const harvestMgmtExec = useBlockExecuteAs(blockExecBase)
  const harvestPerfExec = useBlockExecuteAs(blockExecBase)

  const perpDexBalance = useMemo(() => {
    const trimmed = perpDexBalanceInput.trim()
    if (!trimmed) return undefined
    try {
      return parseUnits(trimmed, WAD_DECIMALS)
    } catch {
      return undefined
    }
  }, [perpDexBalanceInput])

  const balanceInputInvalid = perpDexBalanceInput.trim() !== '' && perpDexBalance === undefined
  const balanceFormValid = perpDexBalance !== undefined

  const { data: currentPps, isFetching: ppsLoading } = useReadContract({
    address: fundContractAddress,
    abi: FUND_CONTRACT_ABI,
    functionName: 'pricePerShare',
  })

  const { data: currentNav, isFetching: navLoading } = useReadContract({
    address: perpNavAddress,
    abi: PERP_NAV_CONTRACT_ABI,
    functionName: 'getFundNavValue',
    query: { enabled: Boolean(perpNavAddress) },
  })

  const { data: previewPps, isFetching: previewPpsLoading } = useReadContract({
    address: fundContractAddress,
    abi: FUND_CONTRACT_ABI,
    functionName: 'previewUpdateNAV',
    args: perpDexBalance !== undefined ? [perpDexBalance] : undefined,
    query: { enabled: perpDexBalance !== undefined },
  })

  const syncProposeTx = useProposeSafeTransaction(syncExec.safeAddr)
  const updateProposeTx = useProposeSafeTransaction(updateNavExec.safeAddr)
  const harvestMgmtProposeTx = useProposeSafeTransaction(harvestMgmtExec.safeAddr)
  const harvestPerfProposeTx = useProposeSafeTransaction(harvestPerfExec.safeAddr)

  const {
    writeContract,
    data: eoaTxHash,
    isPending: eoaIsPending,
    isSuccess: eoaIsSuccess,
    isError: eoaIsError,
    error: eoaError,
    reset: resetEoa,
  } = useWriteContract()

  const { isLoading: eoaIsConfirming, isSuccess: eoaConfirmed } = useWaitForTransactionReceipt({
    hash: eoaTxHash,
    query: { enabled: Boolean(eoaTxHash) },
  })

  useEffect(() => {
    if (eoaConfirmed) {
      startTransition(() => router.refresh())
    }
  }, [eoaConfirmed, router])

  const isWrongChain = isConnected && chainId !== 999

  const canExecuteSync = syncExec.canExecutePerp && Boolean(perpNavAddress)
  const canExecuteUpdate = updateNavExec.canExecuteFund
  const canExecuteHarvestMgmt = harvestMgmtExec.canExecuteFund
  const canExecuteHarvestPerf = harvestPerfExec.canExecuteFund

  function resetTxState() {
    resetEoa()
    setLastEoaAction(null)
    syncProposeTx.reset()
    updateProposeTx.reset()
    harvestMgmtProposeTx.reset()
    harvestPerfProposeTx.reset()
  }

  function handleSyncEoa() {
    if (!canExecuteSync || !perpNavAddress || perpDexBalance === undefined) return
    resetEoa()
    setLastEoaAction('sync')
    writeContract({
      address: perpNavAddress,
      abi: PERP_NAV_CONTRACT_ABI,
      functionName: 'syncPerpDexBalance',
      args: [perpDexBalance],
    })
  }

  function handleSyncSafe() {
    if (!canExecuteSync || !perpNavAddress || perpDexBalance === undefined) return
    syncProposeTx.reset()
    const calldata = encodeFunctionData({
      abi: PERP_NAV_CONTRACT_ABI,
      functionName: 'syncPerpDexBalance',
      args: [perpDexBalance],
    })
    syncProposeTx.mutate({ to: perpNavAddress, data: calldata })
  }

  function handleUpdateEoa() {
    if (!canExecuteUpdate) return
    resetEoa()
    setLastEoaAction('update')
    writeContract({
      address: fundContractAddress,
      abi: FUND_CONTRACT_ABI,
      functionName: 'updateNav',
    })
  }

  function handleUpdateSafe() {
    if (!canExecuteUpdate) return
    updateProposeTx.reset()
    const calldata = encodeFunctionData({
      abi: FUND_CONTRACT_ABI,
      functionName: 'updateNav',
    })
    updateProposeTx.mutate({ to: fundContractAddress, data: calldata })
  }
  function handleHarvestMgmtEoa() {
    if (!canExecuteHarvestMgmt) return
    resetEoa()
    setLastEoaAction('harvestMgmt')
    writeContract({
      address: fundContractAddress,
      abi: FUND_CONTRACT_ABI,
      functionName: 'harvestManagementFee',
    })
  }

  function handleHarvestMgmtSafe() {
    if (!canExecuteHarvestMgmt) return
    harvestMgmtProposeTx.reset()
    const calldata = encodeFunctionData({
      abi: FUND_CONTRACT_ABI,
      functionName: 'harvestManagementFee',
    })
    harvestMgmtProposeTx.mutate({ to: fundContractAddress, data: calldata })
  }

  function handleHarvestPerfEoa() {
    if (!canExecuteHarvestPerf) return
    resetEoa()
    setLastEoaAction('harvestPerf')
    writeContract({
      address: fundContractAddress,
      abi: FUND_CONTRACT_ABI,
      functionName: 'harvestPerformanceFee',
    })
  }

  function handleHarvestPerfSafe() {
    if (!canExecuteHarvestPerf) return
    harvestPerfProposeTx.reset()
    const calldata = encodeFunctionData({
      abi: FUND_CONTRACT_ABI,
      functionName: 'harvestPerformanceFee',
    })
    harvestPerfProposeTx.mutate({ to: fundContractAddress, data: calldata })
  }


  const eoaBusy = eoaIsPending || eoaIsConfirming
  const syncEoaSuccess = eoaIsSuccess && lastEoaAction === 'sync'
  const updateEoaSuccess = eoaIsSuccess && lastEoaAction === 'update'
  const harvestMgmtEoaSuccess = eoaIsSuccess && lastEoaAction === 'harvestMgmt'
  const harvestPerfEoaSuccess = eoaIsSuccess && lastEoaAction === 'harvestPerf'
  const syncEoaError = eoaIsError && lastEoaAction === 'sync'
  const updateEoaError = eoaIsError && lastEoaAction === 'update'
  const harvestMgmtEoaError = eoaIsError && lastEoaAction === 'harvestMgmt'
  const harvestPerfEoaError = eoaIsError && lastEoaAction === 'harvestPerf'

  const syncBtn = buildActionButtonState(syncExec.mode, 'Sync balance', 'Propose sync', '✓ Synced', {
    isConnected,
    isWrongChain,
    canExecute: canExecuteSync,
    formValid: balanceFormValid,
    pending: syncExec.mode === 'eoa' ? eoaBusy && lastEoaAction === 'sync' : syncProposeTx.isPending,
    success: syncExec.mode === 'eoa' ? syncEoaSuccess : syncProposeTx.isSuccess,
    errored: syncExec.mode === 'eoa' ? syncEoaError : syncProposeTx.isError,
    invalidLabel: balanceInputInvalid ? 'Invalid balance' : undefined,
  })

  const syncNeedsBalance =
    isConnected &&
    !isWrongChain &&
    canExecuteSync &&
    Boolean(perpNavAddress) &&
    !balanceFormValid &&
    !balanceInputInvalid

  const updateBtn = buildActionButtonState(updateNavExec.mode, 'Update NAV', 'Propose update NAV', '✓ Updated', {
    isConnected,
    isWrongChain,
    canExecute: canExecuteUpdate,
    formValid: true,
    pending: updateNavExec.mode === 'eoa' ? eoaBusy && lastEoaAction === 'update' : updateProposeTx.isPending,
    success: updateNavExec.mode === 'eoa' ? updateEoaSuccess : updateProposeTx.isSuccess,
    errored: updateNavExec.mode === 'eoa' ? updateEoaError : updateProposeTx.isError,
  })

  const syncError =
    syncExec.mode === 'eoa' && syncEoaError ? eoaError?.message : syncProposeTx.error?.message
  const updateError =
    updateNavExec.mode === 'eoa' && updateEoaError ? eoaError?.message : updateProposeTx.error?.message
  const harvestMgmtBtn = buildActionButtonState(
    harvestMgmtExec.mode,
    'Harvest management fee',
    'Propose harvest mgmt',
    '✓ Harvested',
    {
      isConnected,
      isWrongChain,
      canExecute: canExecuteHarvestMgmt,
      formValid: true,
      pending:
        harvestMgmtExec.mode === 'eoa'
          ? eoaBusy && lastEoaAction === 'harvestMgmt'
          : harvestMgmtProposeTx.isPending,
      success: harvestMgmtExec.mode === 'eoa' ? harvestMgmtEoaSuccess : harvestMgmtProposeTx.isSuccess,
      errored: harvestMgmtExec.mode === 'eoa' ? harvestMgmtEoaError : harvestMgmtProposeTx.isError,
    },
  )

  const harvestPerfBtn = buildActionButtonState(
    harvestPerfExec.mode,
    'Harvest performance fee',
    'Propose harvest perf',
    '✓ Harvested',
    {
      isConnected,
      isWrongChain,
      canExecute: canExecuteHarvestPerf,
      formValid: true,
      pending:
        harvestPerfExec.mode === 'eoa'
          ? eoaBusy && lastEoaAction === 'harvestPerf'
          : harvestPerfProposeTx.isPending,
      success: harvestPerfExec.mode === 'eoa' ? harvestPerfEoaSuccess : harvestPerfProposeTx.isSuccess,
      errored: harvestPerfExec.mode === 'eoa' ? harvestPerfEoaError : harvestPerfProposeTx.isError,
    },
  )

  const harvestMgmtError =
    harvestMgmtExec.mode === 'eoa' && harvestMgmtEoaError
      ? eoaError?.message
      : harvestMgmtProposeTx.error?.message
  const harvestPerfError =
    harvestPerfExec.mode === 'eoa' && harvestPerfEoaError
      ? eoaError?.message
      : harvestPerfProposeTx.error?.message

  const renderExecuteAs = (
    instanceId: string,
    scope: ExecuteAsScope,
    exec: ReturnType<typeof useBlockExecuteAs>,
  ) => (
    <ExecuteAsSection
      key={instanceId}
      scope={scope}
      instanceId={instanceId}
      mode={exec.mode}
      onModeChange={(mode) => {
        exec.setMode(mode)
        resetTxState()
      }}
      walletAddress={address}
      walletHasFundAdmin={walletHasFundAdmin}
      walletHasPerpAdmin={walletHasPerpAdmin}
      safeOptions={safeOptions}
      safeLabel={exec.safeLabel}
      onSafeLabelChange={exec.setSafeLabel}
      isSafeOwner={exec.isSafeOwner}
      safeHasFundAdmin={exec.safeHasFundAdmin}
      safeHasPerpAdmin={exec.safeHasPerpAdmin}
    />
  )


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">NAV Management</h1>
        <div className="ml-auto">
          <RefreshButton autoRefreshMs={V2_AUTO_REFRESH_MS} lastUpdatedAt={data.fetchedAt} />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            1
          </span>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Sync Perp DEX balance</h2>
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            PerpNav.syncPerpDexBalance(balance)
          </span>
        </div>
        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Sync the on-chain Perp DEX balance on the Perp NAV contract before updating fund NAV.
          Requires <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ADMIN</code>{' '}
          on the Perp NAV contract.
        </p>
        {!perpNavAddress && (
          <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">
            Perp NAV contract is not configured for this vault.
          </p>
        )}
        <div className="mb-4">
          <label htmlFor="perp-dex-balance" className="text-sm text-neutral-600 dark:text-neutral-400">
            Perp DEX balance to sync
          </label>
          <input
            id="perp-dex-balance"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={perpDexBalanceInput}
            onChange={(e) => setPerpDexBalanceInput(e.target.value)}
            className="mt-1 w-full max-w-md rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm tabular-nums text-neutral-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
          {balanceInputInvalid && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Enter a valid number.</p>
          )}
          {syncNeedsBalance && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Enter the Perp DEX balance above to enable sync.
            </p>
          )}
        </div>
        {renderExecuteAs('sync', 'sync', syncExec)}
        <ActionButtonRow
          label={syncBtn.label}
          disabled={syncBtn.disabled}
          btnClass={syncBtn.btnClass}
          onClick={syncExec.mode === 'eoa' ? handleSyncEoa : handleSyncSafe}
          pending={syncExec.mode === 'eoa' ? eoaBusy && lastEoaAction === 'sync' : syncProposeTx.isPending}
          error={syncError}
          success={syncExec.mode === 'eoa' ? syncEoaSuccess : syncProposeTx.isSuccess}
          successLink={
            syncExec.mode === 'safe' && syncProposeTx.isSuccess
              ? { href: safeTransactionsHref(config.slug), text: 'View pending →' }
              : undefined
          }
        />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            2
          </span>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Update NAV</h2>
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            FundContract.updateNav()
          </span>
        </div>

        <div className="mb-4">
          <p className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">NAV snapshot</p>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">Current PPS</p>
              <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
                {formatMetric(currentPps, ppsLoading)}
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">pricePerShare()</code>
              </p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">PPS after updateNav</p>
              <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
                {balanceInputInvalid
                  ? 'Invalid input'
                  : formatMetric(previewPps, previewPpsLoading && balanceFormValid)}
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                  previewUpdateNAV(balance)
                </code>
              </p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">Current NAV</p>
              <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
                {perpNavAddress ? formatMetric(currentNav, navLoading) : 'Perp NAV not configured'}
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">getFundNavValue()</code>
              </p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">NAV after syncPerpDexBalance</p>
              <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
                {balanceFormValid
                  ? formatTokenAmount(perpDexBalance!.toString(), WAD_DECIMALS, 6)
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                From step 1 balance input
              </p>
            </div>
          </div>
        </div>

        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Recompute and persist the new PPS on the fund contract. Run step 1 first so the synced
          Perp DEX balance is reflected. Requires{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ADMIN</code> on the
          fund contract (EOA or Safe proposal via Execute as below).
        </p>
        {renderExecuteAs('update-nav', 'fund', updateNavExec)}
        <ActionButtonRow
          label={updateBtn.label}
          disabled={updateBtn.disabled}
          btnClass={updateBtn.btnClass}
          onClick={updateNavExec.mode === 'eoa' ? handleUpdateEoa : handleUpdateSafe}
          pending={updateNavExec.mode === 'eoa' ? eoaBusy && lastEoaAction === 'update' : updateProposeTx.isPending}
          error={updateError}
          success={updateNavExec.mode === 'eoa' ? updateEoaSuccess : updateProposeTx.isSuccess}
          successLink={
            updateNavExec.mode === 'safe' && updateProposeTx.isSuccess
              ? { href: safeTransactionsHref(config.slug), text: 'View pending →' }
              : undefined
          }
        />
      </div>
      <HarvestManagementFeeV2Section
        data={data}
        stepNumber={3}
        executeAs={renderExecuteAs('harvest-mgmt', 'fund', harvestMgmtExec)}
        action={{
          label: harvestMgmtBtn.label,
          disabled: harvestMgmtBtn.disabled,
          btnClass: harvestMgmtBtn.btnClass,
          onClick: harvestMgmtExec.mode === 'eoa' ? handleHarvestMgmtEoa : handleHarvestMgmtSafe,
          pending:
            harvestMgmtExec.mode === 'eoa'
              ? eoaBusy && lastEoaAction === 'harvestMgmt'
              : harvestMgmtProposeTx.isPending,
          error: harvestMgmtError,
          success: harvestMgmtExec.mode === 'eoa' ? harvestMgmtEoaSuccess : harvestMgmtProposeTx.isSuccess,
          successLink:
            harvestMgmtExec.mode === 'safe' && harvestMgmtProposeTx.isSuccess
              ? { href: safeTransactionsHref(config.slug), text: 'View pending →' }
              : undefined,
        }}
      />

      <HarvestPerformanceFeeV2Section
        data={data}
        stepNumber={4}
        executeAs={renderExecuteAs('harvest-perf', 'fund', harvestPerfExec)}
        action={{
          label: harvestPerfBtn.label,
          disabled: harvestPerfBtn.disabled,
          btnClass: harvestPerfBtn.btnClass,
          onClick: harvestPerfExec.mode === 'eoa' ? handleHarvestPerfEoa : handleHarvestPerfSafe,
          pending:
            harvestPerfExec.mode === 'eoa'
              ? eoaBusy && lastEoaAction === 'harvestPerf'
              : harvestPerfProposeTx.isPending,
          error: harvestPerfError,
          success: harvestPerfExec.mode === 'eoa' ? harvestPerfEoaSuccess : harvestPerfProposeTx.isSuccess,
          successLink:
            harvestPerfExec.mode === 'safe' && harvestPerfProposeTx.isSuccess
              ? { href: safeTransactionsHref(config.slug), text: 'View pending →' }
              : undefined,
        }}
      />

    </div>
  )
}
