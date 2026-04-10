'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { decodeFunctionData, encodeFunctionData, getAddress, parseUnits } from 'viem'
import { HA_BASE_ABI, VAULT_MANAGER_ADMIN_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useRoleCheck } from '@/lib/safe/hooks'
import { TIMELOCKED_FUNCTIONS } from '@/lib/timelocks-reader'
import type { PendingOperation } from '@/lib/timelocks-reader'
import { getVaultConfigData } from '@/lib/vault-config-reader'
import { useVaultConfig } from '@/lib/vault-context'
import type { VaultConfigData } from '@/lib/vault-config-reader'
import { useCountdown } from '@/lib/hooks/use-countdown'

// ── Row definition ────────────────────────────────────────────────────────────

type ArgType = 'address' | 'wad_pct' | 'seconds'

type RowDef = {
  label: string
  display: (d: VaultConfigData) => string
  isAddress?: boolean
  setter?: {
    fnName: string
    argType: ArgType
    timelocked: boolean
    placeholder: string
    hint?: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(addr: string) {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

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

function formatWadRate(raw: string): string {
  if (!raw || raw === '0') return '0%'
  try {
    const pct = (Number(BigInt(raw)) / 1e18) * 100
    return `${pct.toFixed(2).replace(/\.00$/, '')}%`
  } catch { return raw }
}

function formatTimestamp(raw: string): string {
  if (!raw || raw === '0') return 'Never'
  try { return new Date(Number(raw) * 1000).toLocaleString() } catch { return raw }
}

function formatCountdown(executableAt: string): string {
  const diff = Number(executableAt) * 1000 - Date.now()
  if (diff <= 0) return 'Ready to execute'
  const s = Math.ceil(diff / 1000)
  return `Executable in ${formatDuration(s)}`
}

/** Convert user-entered percentage string (e.g. "1.5") → WAD bigint */
function pctToWad(pct: string): bigint {
  return parseUnits(pct, 16) // 1% = 1e16, so decimals=16 maps "1" → 1e16
}

/** Encode the setter calldata — wraps in submit() if timelocked */
function encodeCalldata(
  fnName: string,
  argType: ArgType,
  inputValue: string,
  timelocked: boolean,
): `0x${string}` | null {
  try {
    let innerData: `0x${string}`
    if (argType === 'address') {
      const addr = getAddress(inputValue)
      innerData = encodeFunctionData({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        abi: VAULT_MANAGER_ADMIN_ABI as any,
        functionName: fnName,
        args: [addr],
      })
    } else if (argType === 'wad_pct') {
      const wad = pctToWad(inputValue)
      innerData = encodeFunctionData({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        abi: VAULT_MANAGER_ADMIN_ABI as any,
        functionName: fnName,
        args: [wad],
      })
    } else {
      // seconds
      const secs = BigInt(Math.round(Number(inputValue)))
      innerData = encodeFunctionData({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        abi: VAULT_MANAGER_ADMIN_ABI as any,
        functionName: fnName,
        args: [secs],
      })
    }

    if (timelocked) {
      return encodeFunctionData({
        abi: HA_BASE_ABI,
        functionName: 'submit',
        args: [innerData],
      })
    }
    return innerData
  } catch {
    return null
  }
}

// ── Inline edit row ───────────────────────────────────────────────────────────

type EditRowProps = {
  def: RowDef
  data: VaultConfigData
  adminSafeAddress?: `0x${string}`
  adminIsSafeOwner: boolean
  adminHasRole: boolean
  timelockSafeAddress?: `0x${string}`
  timelockIsSafeOwner: boolean
  timelockHasRole: boolean
}

function EditRow({ def, data, adminSafeAddress, adminIsSafeOwner, adminHasRole, timelockSafeAddress, timelockIsSafeOwner, timelockHasRole }: EditRowProps) {
  const { isConnected, chainId } = useAccount()

  // Use timelock_proposer role for timelocked rows, admin for the rest
  const isTimelocked = def.setter?.timelocked ?? false
  const safeAddress = isTimelocked ? timelockSafeAddress : adminSafeAddress
  const isSafeOwner = isTimelocked ? timelockIsSafeOwner : adminIsSafeOwner
  const hasRole = isTimelocked ? timelockHasRole : adminHasRole
  const roleLabel = isTimelocked ? 'TIMELOCK_PROPOSER_ROLE' : 'DEFAULT_ADMIN_ROLE'

  const proposeTx = useProposeSafeTransaction(safeAddress)
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')

  const { setter } = def
  const isWrongChain = isConnected && chainId !== 999

  const timelockFnDef = setter?.timelocked
    ? TIMELOCKED_FUNCTIONS.find((f) => f.name === setter.fnName)
    : null
  const durationSeconds = timelockFnDef
    ? Number(data.timelockDurations[setter!.fnName] ?? '0')
    : 0

  const pendingOp = setter?.timelocked
    ? data.pendingOps.find((op) => op.fnName === setter.fnName)
    : undefined

  const calldata = (setter && inputValue.trim()
    ? encodeCalldata(setter.fnName, setter.argType, inputValue.trim(), setter.timelocked)
    : null) as `0x${string}` | null

  function handlePropose() {
    if (!calldata) return
    proposeTx.reset()
    proposeTx.mutate({
      to: data.vaultManagerAdminAddress as `0x${string}`,
      data: calldata as `0x${string}`,
    })
  }

  function handleCancel() {
    setOpen(false)
    setInputValue('')
    proposeTx.reset()
  }

  // button label/style
  let btnLabel = 'Propose via Safe'
  let btnDisabled = false
  let btnClass = 'bg-blue-600 text-white hover:bg-blue-700'
  if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true
    btnClass = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!isSafeOwner) {
    btnLabel = 'Not a Safe owner'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!hasRole) {
    btnLabel = `No ${roleLabel}`; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm in wallet...'; btnDisabled = true
  } else if (proposeTx.isSuccess) {
    btnLabel = 'Proposed'; btnDisabled = true
    btnClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    btnLabel = 'Failed — Retry'
    btnClass = 'bg-red-600 text-white hover:bg-red-700'
  }

  const displayVal = def.display(data)

  return (
    <div className="py-2.5">
      {/* Main row */}
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">{def.label}</span>
          {setter?.timelocked && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Timelocked{durationSeconds > 0 ? ` · ${formatDuration(durationSeconds)}` : ''}
            </span>
          )}
        </div>
        <span
          className={`shrink-0 text-sm ${def.isAddress ? 'font-mono' : ''} text-neutral-900 dark:text-neutral-100`}
          title={displayVal}
        >
          {displayVal || '—'}
        </span>
        {setter && !open && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            Edit
          </button>
        )}
      </div>

      {/* Expanded edit panel */}
      {setter && open && (
        <div className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
          {/* Pending op banner */}
          {pendingOp && (
            <div className={`mb-3 rounded px-2.5 py-1.5 text-xs ${
              pendingOp.isReady
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
            }`}>
              Pending: {pendingOp.isReady ? 'Ready to execute' : formatCountdown(pendingOp.executableAt)}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={setter.placeholder}
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); proposeTx.reset() }}
              className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
            />
            <button
              onClick={handlePropose}
              disabled={btnDisabled || !calldata}
              className={`shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                !calldata
                  ? 'cursor-not-allowed bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500'
                  : btnClass
              }`}
            >
              {btnLabel}
            </button>
            <button
              onClick={handleCancel}
              className="shrink-0 rounded px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
            >
              Cancel
            </button>
          </div>

          {setter.hint && (
            <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">{setter.hint}</p>
          )}

          {setter.timelocked && durationSeconds > 0 && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              Will queue via <code className="font-mono">submit()</code> — executable after {formatDuration(durationSeconds)} delay
            </p>
          )}

          {proposeTx.isSuccess && (
            <p className="mt-1.5 text-xs">
              <Link href="/safe-transactions" className="text-blue-600 hover:underline dark:text-blue-400">
                View in Safe Transactions →
              </Link>
            </p>
          )}

          {proposeTx.error && (
            <p className="mt-1.5 truncate text-xs text-red-600 dark:text-red-400" title={proposeTx.error.message}>
              {proposeTx.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title,
  rows,
  data,
  adminSafeAddress,
  adminIsSafeOwner,
  adminHasRole,
  timelockSafeAddress,
  timelockIsSafeOwner,
  timelockHasRole,
}: {
  title: string
  rows: RowDef[]
  data: VaultConfigData
  adminSafeAddress?: `0x${string}`
  adminIsSafeOwner: boolean
  adminHasRole: boolean
  timelockSafeAddress?: `0x${string}`
  timelockIsSafeOwner: boolean
  timelockHasRole: boolean
}) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-white">{title}</h2>
      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white px-5 dark:divide-neutral-800 dark:border-neutral-700 dark:bg-neutral-900">
        {rows.map((row) => (
          <EditRow
            key={row.label}
            def={row}
            data={data}
            adminSafeAddress={adminSafeAddress}
            adminIsSafeOwner={adminIsSafeOwner}
            adminHasRole={adminHasRole}
            timelockSafeAddress={timelockSafeAddress}
            timelockIsSafeOwner={timelockIsSafeOwner}
            timelockHasRole={timelockHasRole}
          />
        ))}
      </div>
    </section>
  )
}

// ── Pending op card ───────────────────────────────────────────────────────────

function decodeAdminOpCalldata(data: `0x${string}`): { fnName: string; args: string } {
  try {
    const { functionName, args } = decodeFunctionData({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      abi: VAULT_MANAGER_ADMIN_ABI as any,
      data,
    })
    const argsStr = args ? (args as readonly unknown[]).map((a) => String(a)).join(', ') : ''
    return { fnName: functionName, args: argsStr }
  } catch {
    const sel = data.slice(0, 10).toLowerCase()
    const fn = TIMELOCKED_FUNCTIONS.find((f) => f.selector.toLowerCase() === sel)
    return { fnName: fn?.name ?? 'unknown', args: data.slice(10, 50) + '…' }
  }
}

function PendingOpCard({
  op,
  adminAddress,
  safeAddress,
  isSafeOwner,
  hasRole,
  isConnected,
  isWrongChain,
}: {
  op: PendingOperation
  adminAddress: `0x${string}`
  safeAddress: `0x${string}` | undefined
  isSafeOwner: boolean
  hasRole: boolean
  isConnected: boolean
  isWrongChain: boolean
}) {
  const proposeTx = useProposeSafeTransaction(safeAddress)
  const countdown = useCountdown(Number(op.executableAt))
  const decoded = useMemo(() => decodeAdminOpCalldata(op.data as `0x${string}`), [op.data])

  function handleExecute() {
    proposeTx.reset()
    proposeTx.mutate({ to: adminAddress, data: op.data as `0x${string}` })
  }

  const base = 'rounded-md px-3 py-1.5 text-xs font-medium transition-colors'
  const disabledStyle = `${base} bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500`

  let btnLabel: string
  let btnDisabled = false
  let btnClass = `${base} bg-green-600 text-white hover:bg-green-700`

  if (!op.isReady) {
    btnLabel = countdown ?? 'Waiting…'; btnDisabled = true; btnClass = disabledStyle
  } else if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true; btnClass = disabledStyle
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true; btnClass = `${base} bg-amber-100 text-amber-600 cursor-not-allowed`
  } else if (!isSafeOwner) {
    btnLabel = 'Not owner'; btnDisabled = true; btnClass = disabledStyle
  } else if (!hasRole) {
    btnLabel = 'No role'; btnDisabled = true; btnClass = disabledStyle
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm…'; btnDisabled = true
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
              {op.isReady ? 'Ready' : (countdown ?? 'Waiting')}
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
            <span className="max-w-[200px] cursor-help truncate text-xs text-red-600 dark:text-red-400" title={proposeTx.error.message}>
              {proposeTx.error.message}
            </span>
          )}
          <button onClick={handleExecute} disabled={btnDisabled} className={btnClass}>
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row definitions ───────────────────────────────────────────────────────────

const CONTRACT_ADDRESS_ROWS: RowDef[] = [
  { label: 'VaultManager',      display: (d) => truncate(d.vaultManagerAddress),      isAddress: true },
  { label: 'VaultManagerAdmin', display: (d) => truncate(d.vaultManagerAdminAddress), isAddress: true },
  {
    label: 'Access Manager', display: (d) => truncate(d.accessManager), isAddress: true,
    setter: { fnName: 'setAccessManager', argType: 'address', timelocked: true, placeholder: '0x…' },
  },
  {
    label: 'Share Token', display: (d) => truncate(d.shareToken), isAddress: true,
    setter: { fnName: 'setShareToken', argType: 'address', timelocked: true, placeholder: '0x…' },
  },
  {
    label: 'Fund Vault', display: (d) => truncate(d.fundVaultAddress), isAddress: true,
    setter: { fnName: 'setFundVault', argType: 'address', timelocked: true, placeholder: '0x…' },
  },
  {
    label: 'Request Manager', display: (d) => truncate(d.requestManager), isAddress: true,
    setter: { fnName: 'setRequestManager', argType: 'address', timelocked: false, placeholder: '0x…' },
  },
  {
    label: 'Price Feed', display: (d) => truncate(d.priceFeed), isAddress: true,
    setter: { fnName: 'setPriceFeed', argType: 'address', timelocked: false, placeholder: '0x…' },
  },
  {
    label: 'Fund NAV', display: (d) => truncate(d.fundNav), isAddress: true,
    setter: { fnName: 'setFundNav', argType: 'address', timelocked: false, placeholder: '0x…' },
  },
]

const FEE_CONFIG_ROWS: RowDef[] = [
  {
    label: 'Fee Receiver', display: (d) => truncate(d.feeConfig.feeReceiver), isAddress: true,
    setter: { fnName: 'setFeeReceiver', argType: 'address', timelocked: true, placeholder: '0x…' },
  },
  {
    label: 'Management Fee Rate', display: (d) => formatWadRate(d.feeConfig.managementFeeRate),
    setter: {
      fnName: 'setManagementFeeRate', argType: 'wad_pct', timelocked: false,
      placeholder: 'e.g. 1.5', hint: 'Enter as a percentage (max 10%). E.g. "2" = 2%',
    },
  },
  {
    label: 'Performance Fee Rate', display: (d) => formatWadRate(d.feeConfig.performanceFeeRate),
    setter: {
      fnName: 'setPerformanceFeeRate', argType: 'wad_pct', timelocked: false,
      placeholder: 'e.g. 20', hint: 'Enter as a percentage (max 50%). E.g. "20" = 20%',
    },
  },
  { label: 'High Watermark (PPS)',     display: (d) => formatWadRate(d.feeConfig.highWatermark) },
  { label: 'Last Management Harvest',  display: (d) => formatTimestamp(d.feeConfig.lastManagementHarvest) },
  { label: 'Last Performance Harvest', display: (d) => formatTimestamp(d.feeConfig.lastHarvestPerformanceFeeTime) },
]

const NAV_RISK_ROWS: RowDef[] = [
  {
    label: 'Max PPS Deviation', display: (d) => d.deviationPps === '0' ? 'No limit' : formatWadRate(d.deviationPps),
    setter: {
      fnName: 'setDeviationPps', argType: 'wad_pct', timelocked: false,
      placeholder: 'e.g. 5', hint: 'Enter as a percentage. E.g. "5" = 5% max deviation. 0 = no limit.',
    },
  },
  {
    label: 'Max NAV Staleness', display: (d) => d.maxNavStaleness === '0' ? 'Disabled' : formatDuration(Number(d.maxNavStaleness)),
    setter: {
      fnName: 'setMaxNavStaleness', argType: 'seconds', timelocked: false,
      placeholder: 'seconds, e.g. 3600', hint: 'Maximum age of NAV update in seconds. 0 = disabled.',
    },
  },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function VaultConfigClient() {
  const adminCheck = useRoleCheck('admin')
  const timelockProposerCheck = useRoleCheck('timelock_proposer')
  const { isConnected, chainId } = useAccount()
  const isWrongChain = isConnected && chainId !== 999
  const vaultConfig = useVaultConfig()

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['vault-config', vaultConfig.slug],
    queryFn: () => getVaultConfigData(vaultConfig),
    refetchInterval: 300_000,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="py-20 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Loading configuration…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Failed to load vault configuration.{' '}
        {error instanceof Error ? error.message : 'Unknown error.'}
      </div>
    )
  }
  const commonProps = {
    data,
    adminSafeAddress: adminCheck.safeAddress,
    adminIsSafeOwner: adminCheck.isSafeOwner,
    adminHasRole: adminCheck.hasRole,
    timelockSafeAddress: timelockProposerCheck.safeAddress,
    timelockIsSafeOwner: timelockProposerCheck.isSafeOwner,
    timelockHasRole: timelockProposerCheck.hasRole,
  }

  return (
    <div className="space-y-10">
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Vault Configuration</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <svg
            className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}
            xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <Section title="Contract Addresses"    rows={CONTRACT_ADDRESS_ROWS} {...commonProps} />
      <Section title="Fee Configuration"     rows={FEE_CONFIG_ROWS}       {...commonProps} />
      <Section title="NAV & Risk Parameters" rows={NAV_RISK_ROWS}         {...commonProps} />

      {/* ── Pending Timelock Operations ───────────────────────────────── */}
      {data.pendingOps.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">
            Pending Timelock Operations
          </h2>
          <div className="space-y-3">
            {data.pendingOps.map((op, i) => (
              <PendingOpCard
                key={`${op.selector}-${i}`}
                op={op}
                adminAddress={data.vaultManagerAdminAddress as `0x${string}`}
                safeAddress={adminCheck.safeAddress}
                isSafeOwner={adminCheck.isSafeOwner}
                hasRole={adminCheck.hasRole}
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
