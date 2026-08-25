'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { getAddress, isAddress } from 'viem'
import CopyButton from '@/app/components/CopyButton'
import { FUND_ADMIN_MANAGER_ABI } from '@/lib/abis'
import { getPublicClient } from '@/lib/client'
import {
  formatBpsPercent,
  formatDurationSeconds,
  formatTokenAmount,
  formatV2FeeRatePercent,
  truncateAddress,
} from '@/lib/format'
import { safeTransactionsHref } from '@/lib/resolve-vault'
import { buildV2SafeDropdownOptions, resolveV2SafeAddressFromLabel } from '@/lib/safe/v2-safes'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { useVaultConfig } from '@/lib/vault-context'
import { V2_ENCODED_ROLE_HASHES } from '@/lib/v2-role-hashes'
import type { VaultConfigV2Data } from '@/lib/vault-config-v2-reader'
import {
  encodeFieldCalldata,
  parseFieldInput,
  type V2FieldArgType,
  type V2UpdateFnName,
} from '@/lib/vault-config-v2-save'
import StrategyWalletsSection from './StrategyWalletsSection'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type Props = { data: VaultConfigV2Data }

type ExecMode = 'eoa' | 'safe'

type SafeEntry = { label: string; address: string }

type RowSetter = {
  fnName: V2UpdateFnName
  argType: V2FieldArgType
  placeholder: string
  hint?: string
}

type EditableRowDef = {
  label: string
  display: string
  isAddress?: boolean
  copyValue?: string
  setter: RowSetter
}

type ReadOnlyRowDef = {
  label: string
  display: string
  isAddress?: boolean
  copyValue?: string
}

type RowDef = EditableRowDef | ReadOnlyRowDef

function isEditableRow(row: RowDef): row is EditableRowDef {
  return 'setter' in row
}

function formatTimestamp(seconds: string): string {
  if (!seconds || seconds === '0') return 'Never'
  const ms = Number(seconds) * 1_000
  if (!Number.isFinite(ms) || ms <= 0) return 'Never'
  return new Date(ms).toLocaleString()
}

function formatTxError(e: unknown): string {
  const err = e as { shortMessage?: string; cause?: { shortMessage?: string } }
  return err.cause?.shortMessage ?? err.shortMessage ?? 'Simulation failed'
}

function AddressValue({ address }: { address: string }) {
  const isZero = address === ZERO_ADDRESS
  if (isZero) {
    return <span className="text-yellow-600 dark:text-yellow-400">not set</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm">
      {truncateAddress(address)}
      <CopyButton value={address} />
    </span>
  )
}

function buildVaultSafes(config: ReturnType<typeof useVaultConfig>): SafeEntry[] {
  return buildV2SafeDropdownOptions(config)
}

type EditRowV2Props = {
  def: EditableRowDef
  fundAdminManager: `0x${string}`
  safes: SafeEntry[]
  vaultSlug: string
}

function EditRowV2({ def, fundAdminManager, safes, vaultSlug }: EditRowV2Props) {
  const router = useRouter()
  const { address, isConnected, chainId } = useAccount()
  const isWrongChain = isConnected && chainId !== 999

  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [execMode, setExecMode] = useState<ExecMode>('safe')
  const [safeLabel, setSafeLabel] = useState(safes[0]?.label ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  const safeAddr = useMemo(() => {
    const addr = resolveV2SafeAddressFromLabel(safes, safeLabel)
    return addr && isAddress(addr) ? (getAddress(addr) as `0x${string}`) : undefined
  }, [safes, safeLabel])
  const { data: safeInfo } = useSafeInfo(execMode === 'safe' ? safeAddr : undefined)
  const isSafeOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const { data: eoaHasAdmin } = useReadContract({
    address: fundAdminManager,
    abi: FUND_ADMIN_MANAGER_ABI,
    functionName: 'hasRole',
    args: address ? [V2_ENCODED_ROLE_HASHES.ADMIN, address] : undefined,
    query: { enabled: execMode === 'eoa' && Boolean(address) && open },
  })

  const { data: safeHasAdmin } = useReadContract({
    address: fundAdminManager,
    abi: FUND_ADMIN_MANAGER_ABI,
    functionName: 'hasRole',
    args: safeAddr ? [V2_ENCODED_ROLE_HASHES.ADMIN, safeAddr] : undefined,
    query: { enabled: execMode === 'safe' && Boolean(safeAddr) && open },
  })

  const proposeTx = useProposeSafeTransaction(safeAddr)

  const {
    writeContract,
    data: eoaTxHash,
    isPending: eoaIsPending,
    isError: eoaIsError,
    error: eoaError,
    reset: resetEoa,
  } = useWriteContract()

  const { isLoading: eoaIsConfirming, isSuccess: eoaSucceeded } = useWaitForTransactionReceipt({
    hash: eoaTxHash,
    query: { enabled: Boolean(eoaTxHash) },
  })

  useEffect(() => {
    if (eoaSucceeded) {
      setOpen(false)
      setInputValue('')
      resetEoa()
      router.refresh()
    }
  }, [eoaSucceeded, router, resetEoa])

  const parsed = useMemo(() => {
    if (!inputValue.trim()) return null
    return parseFieldInput(def.label, def.setter.argType, inputValue)
  }, [def.label, def.setter.argType, inputValue])

  const calldata = useMemo(() => {
    if (!parsed || 'error' in parsed) return null
    return encodeFieldCalldata(def.setter.fnName, def.setter.argType, parsed.value)
  }, [def.setter.fnName, def.setter.argType, parsed])

  const canExecuteEoa = isConnected && !isWrongChain && eoaHasAdmin === true
  const canExecuteSafe =
    isConnected && !isWrongChain && isSafeOwner && Boolean(safeAddr) && safeHasAdmin === true
  const canExecute = execMode === 'eoa' ? canExecuteEoa : canExecuteSafe

  const saveBusy = eoaIsPending || eoaIsConfirming || (execMode === 'safe' && proposeTx.isPending)
  const saveSuccess = execMode === 'eoa' ? eoaSucceeded : proposeTx.isSuccess
  const saveError =
    validationError ??
    simError ??
    (execMode === 'eoa' && eoaError ? eoaError.message : null) ??
    (execMode === 'safe' ? proposeTx.error?.message : null)

  function resetTxState() {
    resetEoa()
    setSimError(null)
    setValidationError(null)
    proposeTx.reset()
  }

  function handleCancel() {
    setOpen(false)
    setInputValue('')
    resetTxState()
  }

  async function handleSave() {
    if (!inputValue.trim()) {
      setValidationError('Value is required')
      return
    }
    if (!parsed || 'error' in parsed) {
      setValidationError(parsed && 'error' in parsed ? parsed.error : 'Invalid input')
      return
    }
    if (!calldata || !canExecute) return

    setValidationError(null)
    setSimError(null)

    const simAccount = execMode === 'eoa' ? (address as `0x${string}`) : safeAddr
    if (!simAccount) return

    try {
      const client = getPublicClient()
      if (def.setter.argType === 'address') {
        await client.simulateContract({
          address: fundAdminManager,
          abi: FUND_ADMIN_MANAGER_ABI,
          functionName: def.setter.fnName,
          args: [parsed.value as `0x${string}`],
          account: simAccount,
        })
      } else {
        await client.simulateContract({
          address: fundAdminManager,
          abi: FUND_ADMIN_MANAGER_ABI,
          functionName: def.setter.fnName,
          args: [parsed.value as bigint],
          account: simAccount,
        })
      }
    } catch (e) {
      setSimError(formatTxError(e))
      return
    }

    if (execMode === 'eoa') {
      resetEoa()
      if (def.setter.argType === 'address') {
        writeContract({
          address: fundAdminManager,
          abi: FUND_ADMIN_MANAGER_ABI,
          functionName: def.setter.fnName,
          args: [parsed.value as `0x${string}`],
        })
      } else {
        writeContract({
          address: fundAdminManager,
          abi: FUND_ADMIN_MANAGER_ABI,
          functionName: def.setter.fnName,
          args: [parsed.value as bigint],
        })
      }
      return
    }

    proposeTx.mutate({ to: fundAdminManager, data: calldata })
  }

  const saveDisabled =
    !canExecute || saveBusy || saveSuccess || !inputValue.trim() || (parsed !== null && 'error' in parsed)

  let saveLabel = execMode === 'eoa' ? 'Save' : 'Propose via Safe'
  let saveClass = 'bg-blue-600 text-white hover:bg-blue-700'
  if (!isConnected) {
    saveLabel = 'Connect wallet'
    saveClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    saveLabel = 'Wrong network'
    saveClass = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (execMode === 'eoa' && eoaHasAdmin === false) {
    saveLabel = 'No ADMIN'
    saveClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (execMode === 'safe' && !isSafeOwner) {
    saveLabel = 'Not a Safe owner'
    saveClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (execMode === 'safe' && safeHasAdmin === false) {
    saveLabel = 'Safe has no ADMIN'
    saveClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (saveBusy) {
    saveLabel = 'Working…'
    saveClass = 'bg-blue-600 text-white cursor-not-allowed'
  } else if (saveSuccess) {
    saveLabel = execMode === 'eoa' ? '✓ Saved' : '✓ Proposed'
    saveClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (saveError && !validationError && !simError) {
    saveLabel = 'Retry'
    saveClass = 'bg-red-600 text-white hover:bg-red-700'
  }

  const roleHint = useMemo(() => {
    if (!isConnected || !open) return null
    if (execMode === 'eoa') {
      if (eoaHasAdmin === true) return 'Your wallet holds ADMIN on Fund Admin Manager.'
      if (eoaHasAdmin === false) return 'Your wallet does not hold ADMIN on Fund Admin Manager.'
      return 'Checking ADMIN role…'
    }
    if (!safeAddr) return null
    const parts: string[] = []
    parts.push(isSafeOwner ? 'You are a Safe owner.' : 'You are not an owner of this Safe.')
    if (safeHasAdmin === true) parts.push('Safe holds ADMIN on Fund Admin Manager.')
    else if (safeHasAdmin === false) parts.push('Safe does not hold ADMIN on Fund Admin Manager.')
    return parts.join(' ')
  }, [isConnected, open, execMode, eoaHasAdmin, safeAddr, isSafeOwner, safeHasAdmin])

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">{def.label}</span>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
          {def.isAddress ? (
            <AddressValue address={def.copyValue ?? def.display} />
          ) : (
            def.display
          )}
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              resetTxState()
            }}
            className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            Edit
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
          <input
            type="text"
            placeholder={def.setter.placeholder}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              resetTxState()
            }}
            spellCheck={false}
            className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500"
          />

          {def.setter.hint && (
            <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">{def.setter.hint}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name={`exec-mode-${def.setter.fnName}`}
                checked={execMode === 'eoa'}
                onChange={() => {
                  setExecMode('eoa')
                  resetTxState()
                }}
              />
              Connected wallet (EOA)
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name={`exec-mode-${def.setter.fnName}`}
                checked={execMode === 'safe'}
                onChange={() => {
                  setExecMode('safe')
                  resetTxState()
                }}
              />
              Safe (propose)
            </label>
          </div>

          {execMode === 'eoa' && address && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Caller: {truncateAddress(address)}
            </p>
          )}

          {execMode === 'safe' && (
            <select
              value={safeLabel}
              onChange={(e) => {
                setSafeLabel(e.target.value)
                resetTxState()
              }}
              className="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            >
              {safes.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label} ({truncateAddress(s.address)})
                </option>
              ))}
            </select>
          )}

          {roleHint && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{roleHint}</p>
          )}

          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Calls{' '}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
              FundAdminManager.{def.setter.fnName}(...)
            </code>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveDisabled}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${saveClass}`}
            >
              {saveLabel}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saveBusy}
              className="rounded px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-200 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-700"
            >
              Cancel
            </button>
          </div>

          {saveError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{saveError}</p>
          )}

          {proposeTx.isSuccess && execMode === 'safe' && (
            <Link
              href={safeTransactionsHref(vaultSlug)}
              className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              View pending Safe txs →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function ReadOnlyRow({ row }: { row: ReadOnlyRowDef }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{row.label}</span>
      {row.isAddress ? (
        <AddressValue address={row.copyValue ?? row.display} />
      ) : (
        <span className="text-sm font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
          {row.display}
        </span>
      )}
    </div>
  )
}

function ConfigSection({
  title,
  rows,
  fundAdminManager,
  safes,
  vaultSlug,
}: {
  title: string
  rows: RowDef[]
  fundAdminManager: `0x${string}`
  safes: SafeEntry[]
  vaultSlug: string
}) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-white">{title}</h2>
      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white px-5 dark:divide-neutral-800 dark:border-neutral-700 dark:bg-neutral-900">
        {rows.map((row) =>
          isEditableRow(row) ? (
            <EditRowV2
              key={row.label}
              def={row}
              fundAdminManager={fundAdminManager}
              safes={safes}
              vaultSlug={vaultSlug}
            />
          ) : (
            <ReadOnlyRow key={row.label} row={row} />
          ),
        )}
      </div>
    </section>
  )
}

export default function VaultConfigV2Client({ data }: Props) {
  const vaultConfig = useVaultConfig()
  const safes = useMemo(() => buildVaultSafes(vaultConfig), [vaultConfig])
  const fundAdminManager = getAddress(data.addresses.fundAdminManager) as `0x${string}`

  const addressRows: ReadOnlyRowDef[] = [
    {
      label: 'Fund Contract',
      display: data.addresses.fundContract,
      isAddress: true,
      copyValue: data.addresses.fundContract,
    },
    {
      label: 'Fund Contract Reader',
      display: data.addresses.fundContractReader,
      isAddress: true,
      copyValue: data.addresses.fundContractReader,
    },
    {
      label: 'Fund Admin Manager',
      display: data.addresses.fundAdminManager,
      isAddress: true,
      copyValue: data.addresses.fundAdminManager,
    },
    {
      label: 'Balance Contract',
      display: data.addresses.balanceContract,
      isAddress: true,
      copyValue: data.addresses.balanceContract,
    },
    {
      label: 'Fund NAV Contract',
      display: data.addresses.fundNavContract,
      isAddress: true,
      copyValue: data.addresses.fundNavContract,
    },
    {
      label: 'Timelock',
      display: data.addresses.timelock,
      isAddress: true,
      copyValue: data.addresses.timelock,
    },
  ]

  const vaultConfigRows: RowDef[] = [
    {
      label: 'Minimum Supply',
      display: formatTokenAmount(data.vaultConfig.minimumSupply, 18, 6),
      setter: {
        fnName: 'updateMinimumSupply',
        argType: 'token18',
        placeholder: 'e.g. 0.01',
      },
    },
    {
      label: 'Capacity',
      display: formatTokenAmount(data.vaultConfig.capacity, 18, 6),
      setter: {
        fnName: 'updateCapacity',
        argType: 'token18',
        placeholder: 'e.g. 1000000',
      },
    },
    {
      label: 'Max PPS Deviation',
      display: formatBpsPercent(data.vaultConfig.ppsDeviationBps),
      setter: {
        fnName: 'updatePpsDeviationBps',
        argType: 'bps_percent',
        placeholder: 'e.g. 5',
        hint: 'Percent. Empty or 0 = no limit.',
      },
    },
    {
      label: 'Max NAV Staleness',
      display:
        data.vaultConfig.maxNavStaleness === '0'
          ? 'Disabled'
          : formatDurationSeconds(data.vaultConfig.maxNavStaleness),
      setter: {
        fnName: 'updateMaxNavStaleness',
        argType: 'seconds',
        placeholder: 'seconds, e.g. 3600',
        hint: '0 = disabled.',
      },
    },
  ]

  const feeRows: RowDef[] = [
    {
      label: 'Management Fee Receiver',
      display: data.fees.managementFeeReceiver,
      isAddress: true,
      copyValue: data.fees.managementFeeReceiver,
      setter: {
        fnName: 'updateManagementFeeReceiver',
        argType: 'address',
        placeholder: '0x…',
      },
    },
    {
      label: 'Management Fee Rate',
      display: formatV2FeeRatePercent(data.fees.managementFeeRate),
      setter: {
        fnName: 'updateManagementFeeRate',
        argType: 'whole_percent',
        placeholder: 'e.g. 1',
        hint: 'Whole percent (1 = 1%).',
      },
    },
    {
      label: 'Last Management Harvest',
      display: formatTimestamp(data.fees.lastManagementHarvest),
    },
    {
      label: 'Performance Fee Receiver',
      display: data.fees.performanceFeeReceiver,
      isAddress: true,
      copyValue: data.fees.performanceFeeReceiver,
      setter: {
        fnName: 'updatePerformanceFeeReceiver',
        argType: 'address',
        placeholder: '0x…',
      },
    },
    {
      label: 'Performance Fee Rate',
      display: formatV2FeeRatePercent(data.fees.performanceFeeRate),
      setter: {
        fnName: 'updatePerformanceFeeRate',
        argType: 'whole_percent',
        placeholder: 'e.g. 10',
        hint: 'Whole percent (10 = 10%).',
      },
    },
    {
      label: 'Last Performance Harvest',
      display: formatTimestamp(data.fees.lastPerformanceHarvest),
    },
    {
      label: 'High Watermark (PPS)',
      display: formatTokenAmount(data.fees.highWatermark, 18, 6),
    },
  ]

  const sectionProps = {
    fundAdminManager,
    safes,
    vaultSlug: vaultConfig.slug,
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
        Vault Configuration
      </h1>

      <ConfigSection title="Contract Addresses" rows={addressRows} {...sectionProps} />
      <StrategyWalletsSection />
      <ConfigSection title="Vault Config" rows={vaultConfigRows} {...sectionProps} />
      <ConfigSection title="Fee Configuration" rows={feeRows} {...sectionProps} />

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Settings read from HaVaultReader V2 (getVaultSetting). Updates call per-field functions on
        Fund Admin Manager. Last fetched {new Date(data.fetchedAt).toLocaleString()}.
      </p>
    </div>
  )
}
