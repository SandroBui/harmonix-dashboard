'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { encodeFunctionData, getAddress, isAddress } from 'viem'
import { BALANCE_CONTRACT_ABI, FUND_CONTRACT_ABI } from '@/lib/abis'
import { getPublicClient } from '@/lib/client'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { getDefaultSafeAddress } from '@/lib/safe/roles'
import { useVaultConfig } from '@/lib/vault-context'
import { V2_ENCODED_ROLE_HASHES } from '@/lib/v2-role-hashes'
import type { WithdrawalV2Entry } from '@/lib/withdrawals-v2-reader'

type ExecMode = 'eoa' | 'safe'
type ActionTxState = { isPending: boolean; isSuccess: boolean; isError: boolean }
type SafeOption = { label: string; address: string }

type Props = {
  selected: WithdrawalV2Entry[]
  fundContractAddress: string
  balanceContractAddress: string
  underlyingSymbol: string
  underlyingDecimals: number
  onSuccess: () => void
}

function buildRoleSafeOptions(
  config: ReturnType<typeof useVaultConfig>,
  role: 'operator' | 'admin',
): SafeOption[] {
  const seen = new Set<string>()
  const out: SafeOption[] = []
  const candidates =
    role === 'operator'
      ? [
          { label: 'Operator Safe', address: config.safe.operator },
          { label: 'Default Safe', address: config.safe.default },
        ]
      : [
          { label: 'Admin Safe', address: config.safe.admin },
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

function getActionButtonState(
  mode: ExecMode,
  actionName: string,
  isConnected: boolean,
  isWrongChain: boolean,
  canExecute: boolean,
  formValid: boolean,
  txState: ActionTxState,
  invalidLabel = 'Invalid selection',
): { label: string; disabled: boolean; btnClass: string } {
  const idleLabel = mode === 'eoa' ? actionName : `Propose ${actionName.toLowerCase()}`

  if (!isConnected) {
    return {
      label: 'Connect wallet',
      disabled: true,
      btnClass:
        'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500',
    }
  }
  if (isWrongChain) {
    return {
      label: 'Wrong network',
      disabled: true,
      btnClass:
        'bg-amber-100 text-amber-600 cursor-not-allowed dark:bg-amber-900/30 dark:text-amber-400',
    }
  }
  if (!canExecute) {
    return {
      label: 'Not permitted',
      disabled: true,
      btnClass:
        'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500',
    }
  }
  if (!formValid) {
    return {
      label: invalidLabel,
      disabled: true,
      btnClass:
        'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500',
    }
  }
  if (txState.isPending) {
    return {
      label: 'Working…',
      disabled: true,
      btnClass: 'bg-blue-600 text-white hover:bg-blue-700',
    }
  }
  if (txState.isSuccess) {
    return {
      label: mode === 'eoa' ? '✓ Executed — Retry' : '✓ Proposed',
      disabled: mode !== 'eoa',
      btnClass:
        mode === 'eoa'
          ? 'bg-green-600 text-white hover:bg-green-700'
          : 'bg-green-600 text-white cursor-not-allowed',
    }
  }
  if (txState.isError) {
    return {
      label: 'Failed — Retry',
      disabled: false,
      btnClass: 'bg-red-600 text-white hover:bg-red-700',
    }
  }
  return {
    label: idleLabel,
    disabled: false,
    btnClass: 'bg-blue-600 text-white hover:bg-blue-700',
  }
}

const KNOWN_EXECUTE_ACTION_REASONS: Record<string, string> = {
  FUNCTION_NOT_WHITELISTED:
    'FUNCTION_NOT_WHITELISTED: an admin must whitelist this call via approveAction() on the balance contract before operators can execute it.',
  PENDING_WITHDRAW_AMOUNT_NOT_ENOUGH:
    'PENDING_WITHDRAW_AMOUNT_NOT_ENOUGH: the acquire amount exceeds available pending withdrawal. Each user must call initiateWithdrawal() on the fund contract first, and the vault must have enough total pending withdrawal to cover the amount.',
  INVALID_ROLE: 'INVALID_ROLE: caller does not hold OPERATOR_ROLE on the balance contract.',
}

function extractRevertReason(e: unknown): string | undefined {
  const err = e as {
    shortMessage?: string
    cause?: {
      shortMessage?: string
      reason?: string
      data?: { errorName?: string; args?: unknown[] }
    }
  }
  const args = err.cause?.data?.args
  if (Array.isArray(args) && typeof args[0] === 'string') return args[0]

  const messages = [err.cause?.shortMessage, err.shortMessage, err.cause?.reason].filter(
    Boolean,
  ) as string[]
  for (const msg of messages) {
    const reasonLine = msg.match(/reason:\s*([A-Z0-9_]+)/i)
    if (reasonLine?.[1]) return reasonLine[1]
    const reverted = msg.match(/reverted with the following reason:\s*\n?(.+)/is)
    if (reverted?.[1]) return reverted[1].trim().split('\n')[0]
  }
  return undefined
}

function formatExecuteActionError(e: unknown): string {
  const err = e as {
    shortMessage?: string
    cause?: { shortMessage?: string; data?: { errorName?: string; args?: unknown[] } }
  }
  const reason = extractRevertReason(e)
  if (reason && KNOWN_EXECUTE_ACTION_REASONS[reason]) {
    return KNOWN_EXECUTE_ACTION_REASONS[reason]
  }
  if (reason) return reason
  return err.cause?.shortMessage ?? err.shortMessage ?? 'Simulation failed'
}

function buildAcquireBatch(selected: WithdrawalV2Entry[]): {
  amount: bigint
  users: `0x${string}`[]
  fees: bigint[]
} {
  const amount = selected.reduce((sum, entry) => sum + BigInt(entry.withdrawAmount), 0n)
  const seen = new Set<string>()
  const users: `0x${string}`[] = []
  for (const entry of selected) {
    const lower = entry.controller.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    users.push(getAddress(entry.controller) as `0x${string}`)
  }
  return { amount, users, fees: users.map(() => 0n) }
}

type ExecuteAsSectionProps = {
  name: string
  mode: ExecMode
  onModeChange: (mode: ExecMode) => void
  roleLabel: string
  walletAddress?: string
  walletHasRole?: boolean
  safeOptions: SafeOption[]
  safeAddress: string
  onSafeChange: (address: string) => void
  isSafeOwner: boolean
  safeHasRole?: boolean
}

function ExecuteAsSection({
  name,
  mode,
  onModeChange,
  roleLabel,
  walletAddress,
  walletHasRole,
  safeOptions,
  safeAddress,
  onSafeChange,
  isSafeOwner,
  safeHasRole,
}: ExecuteAsSectionProps) {
  const safeAddr =
    safeAddress && isAddress(safeAddress) ? (getAddress(safeAddress) as `0x${string}`) : undefined

  return (
    <div className="mb-3">
      <p className="mb-2 text-xs text-neutral-600 dark:text-neutral-400">Execute as</p>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="radio"
            name={name}
            checked={mode === 'eoa'}
            onChange={() => onModeChange('eoa')}
          />
          Connected wallet (EOA)
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="radio"
            name={name}
            checked={mode === 'safe'}
            onChange={() => onModeChange('safe')}
          />
          Safe (propose)
        </label>
      </div>
      {mode === 'eoa' && walletAddress && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Caller: {truncateAddress(walletAddress)}
          {walletHasRole === false && ` — wallet does not hold ${roleLabel} on balance contract`}
          {walletHasRole === true && ` — wallet holds ${roleLabel} on balance contract`}
        </p>
      )}
      {mode === 'safe' && (
        <div className="mt-1">
          <select
            value={safeAddress}
            onChange={(e) => onSafeChange(e.target.value)}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {safeOptions.map((s) => (
              <option key={s.address} value={s.address}>
                {s.label} ({truncateAddress(s.address)})
              </option>
            ))}
          </select>
          {safeAddr && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {isSafeOwner ? 'You are a Safe owner' : 'You are not an owner of this Safe'}
              {safeHasRole === true && ` — Safe holds ${roleLabel} on balance contract`}
              {safeHasRole === false &&
                ` — Safe does not hold ${roleLabel} on balance contract (required for propose)`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function WithdrawalsAcquirePanel({
  selected,
  fundContractAddress,
  balanceContractAddress,
  underlyingSymbol,
  underlyingDecimals,
  onSuccess,
}: Props) {
  const config = useVaultConfig()
  const { address, isConnected, chainId } = useAccount()

  const operatorSafeOptions = useMemo(() => buildRoleSafeOptions(config, 'operator'), [config])
  const [execMode, setExecMode] = useState<ExecMode>('eoa')
  const [operatorSafeAddress, setOperatorSafeAddress] = useState(
    operatorSafeOptions[0]?.address ?? '',
  )
  const [simError, setSimError] = useState<string | null>(null)
  const [revertError, setRevertError] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [userLockedShares, setUserLockedShares] = useState<
    { user: `0x${string}`; shares: bigint }[] | null
  >(null)

  const balanceAddr = getAddress(balanceContractAddress) as `0x${string}`
  const fundAddr = getAddress(fundContractAddress) as `0x${string}`
  const operatorRole = V2_ENCODED_ROLE_HASHES.OPERATOR

  const operatorSafeAddr =
    operatorSafeAddress && isAddress(operatorSafeAddress)
      ? (getAddress(operatorSafeAddress) as `0x${string}`)
      : undefined

  const { data: operatorSafeInfo } = useSafeInfo(execMode === 'safe' ? operatorSafeAddr : undefined)

  const operatorIsSafeOwner = Boolean(
    address && operatorSafeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const { data: walletHasOperator } = useReadContract({
    address: balanceAddr,
    abi: BALANCE_CONTRACT_ABI,
    functionName: 'hasRole',
    args: address ? [operatorRole, address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { data: operatorSafeHasRole } = useReadContract({
    address: balanceAddr,
    abi: BALANCE_CONTRACT_ABI,
    functionName: 'hasRole',
    args: operatorSafeAddr ? [operatorRole, operatorSafeAddr] : undefined,
    query: { enabled: Boolean(operatorSafeAddr) },
  })

  const acquireProposeTx = useProposeSafeTransaction(operatorSafeAddr)

  const {
    writeContract,
    data: eoaTxHash,
    isPending: eoaIsPending,
    isError: eoaIsError,
    error: eoaError,
    reset: resetEoa,
  } = useWriteContract()

  const { isLoading: eoaIsConfirming, isSuccess: eoaIsConfirmed, data: eoaReceipt } =
    useWaitForTransactionReceipt({
      hash: eoaTxHash,
      query: { enabled: Boolean(eoaTxHash) },
    })

  const eoaSucceeded = eoaIsConfirmed && eoaReceipt?.status === 'success'
  const eoaReverted = eoaIsConfirmed && eoaReceipt?.status === 'reverted'

  const batch = useMemo(() => buildAcquireBatch(selected), [selected])
  const usersKey = batch.users.join(',')

  const hasZeroWithdrawAmount = selected.some((entry) => BigInt(entry.withdrawAmount) === 0n)
  const formValid = selected.length > 0 && batch.amount > 0n && !hasZeroWithdrawAmount

  const usersWithoutLockedShares =
    userLockedShares?.filter((row) => row.shares === 0n).map((row) => row.user) ?? []

  useEffect(() => {
    if (batch.users.length === 0) {
      setUserLockedShares(null)
      return
    }

    let cancelled = false
    const client = getPublicClient()
    void Promise.all(
      batch.users.map(async (user) => {
        const shares = await client.readContract({
          address: fundAddr,
          abi: FUND_CONTRACT_ABI,
          functionName: 'lockedShares',
          args: [user],
        })
        return { user, shares }
      }),
    )
      .then((rows) => {
        if (!cancelled) setUserLockedShares(rows)
      })
      .catch(() => {
        if (!cancelled) setUserLockedShares(null)
      })

    return () => {
      cancelled = true
    }
  }, [usersKey, fundAddr, batch.users])

  useEffect(() => {
    if (eoaSucceeded) {
      setSimError(null)
      setRevertError(null)
      const t = setTimeout(() => {
        resetEoa()
        onSuccess()
      }, 1000)
      return () => clearTimeout(t)
    }
    if (eoaReverted) {
      setRevertError('Transaction reverted on-chain. Acquire did not complete.')
    }
  }, [eoaSucceeded, eoaReverted, onSuccess, resetEoa])

  useEffect(() => {
    if (acquireProposeTx.isSuccess) {
      const t = setTimeout(() => {
        acquireProposeTx.reset()
        onSuccess()
      }, 1000)
      return () => clearTimeout(t)
    }
  }, [acquireProposeTx.isSuccess, onSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (selected.length === 0) return null

  const isWrongChain = isConnected && chainId !== 999

  const canExecute =
    execMode === 'eoa' ? walletHasOperator === true : operatorIsSafeOwner && operatorSafeHasRole === true

  const acquireValid = formValid && usersWithoutLockedShares.length === 0

  const eoaTxState: ActionTxState = {
    isPending: simulating || eoaIsPending || eoaIsConfirming,
    isSuccess: eoaSucceeded,
    isError: Boolean(simError || revertError) || eoaIsError || eoaReverted,
  }

  const safeTxState: ActionTxState = {
    isPending: acquireProposeTx.isPending,
    isSuccess: acquireProposeTx.isSuccess,
    isError: acquireProposeTx.isError,
  }

  const acquireButton = getActionButtonState(
    execMode,
    'Acquire',
    isConnected,
    isWrongChain,
    canExecute,
    acquireValid,
    execMode === 'eoa' ? eoaTxState : safeTxState,
    hasZeroWithdrawAmount ? 'Missing withdraw amount' : 'Invalid selection',
  )

  const acquireError =
    simError ??
    revertError ??
    (execMode === 'eoa' && eoaIsError && eoaError ? eoaError.message : acquireProposeTx.error?.message)

  async function handleAcquire() {
    if (!acquireValid) return
    setSimError(null)
    setRevertError(null)
    resetEoa()

    const acquireData = encodeFunctionData({
      abi: FUND_CONTRACT_ABI,
      functionName: 'acquireWithdrawalFunds',
      args: [batch.amount, batch.users, batch.fees],
    })
    const executeData = encodeFunctionData({
      abi: BALANCE_CONTRACT_ABI,
      functionName: 'executeAction',
      args: [fundAddr, 0n, acquireData],
    })

    if (execMode === 'eoa') {
      if (!address) return
      setSimulating(true)
      try {
        const client = getPublicClient()
        await client.simulateContract({
          address: balanceAddr,
          abi: BALANCE_CONTRACT_ABI,
          functionName: 'executeAction',
          args: [fundAddr, 0n, acquireData],
          account: address as `0x${string}`,
        })
      } catch (e) {
        setSimError(formatExecuteActionError(e))
        setSimulating(false)
        return
      }
      setSimulating(false)
      writeContract({
        address: balanceAddr,
        abi: BALANCE_CONTRACT_ABI,
        functionName: 'executeAction',
        args: [fundAddr, 0n, acquireData],
      })
    } else {
      acquireProposeTx.reset()
      acquireProposeTx.mutate({ to: balanceAddr, data: executeData })
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-200 bg-white px-4 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-neutral-900 dark:text-white">
              {selected.length} pending withdrawal{selected.length > 1 ? 's' : ''} selected
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-600 dark:text-neutral-300">
              Total acquire amount:{' '}
              <span className="font-medium tabular-nums text-neutral-900 dark:text-white">
                {formatTokenAmount(batch.amount.toString(), underlyingDecimals, 4)}{' '}
                {underlyingSymbol}
              </span>
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-600 dark:text-neutral-300">
              {batch.users.length} user{batch.users.length === 1 ? '' : 's'}
            </span>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Users:{' '}
            {batch.users.map((u) => truncateAddress(u)).join(', ')}
          </p>

          {usersWithoutLockedShares.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {usersWithoutLockedShares.length} user(s) have no pending withdrawal (lockedShares =
              0):{' '}
              {usersWithoutLockedShares.map((u) => truncateAddress(u)).join(', ')}
            </p>
          )}

          <ExecuteAsSection
            name="withdrawals-acquire-exec"
            mode={execMode}
            onModeChange={(mode) => {
              setExecMode(mode)
              setSimError(null)
              setRevertError(null)
              resetEoa()
              acquireProposeTx.reset()
            }}
            roleLabel="OPERATOR_ROLE"
            walletAddress={address}
            walletHasRole={walletHasOperator}
            safeOptions={operatorSafeOptions}
            safeAddress={operatorSafeAddress}
            onSafeChange={(addr) => {
              setOperatorSafeAddress(addr)
              setSimError(null)
              setRevertError(null)
              resetEoa()
              acquireProposeTx.reset()
            }}
            isSafeOwner={operatorIsSafeOwner}
            safeHasRole={operatorSafeHasRole}
          />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {acquireError && (
            <span
              className="max-w-xs break-words text-xs text-red-600 dark:text-red-400"
              title={acquireError}
            >
              {acquireError}
            </span>
          )}

          {acquireButton.label === 'Working…' && (
            <svg
              className="h-4 w-4 animate-spin text-neutral-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}

          {execMode === 'safe' && acquireProposeTx.isSuccess && (
            <Link
              href="/safe-transactions"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View pending →
            </Link>
          )}

          <button
            type="button"
            onClick={handleAcquire}
            disabled={acquireButton.disabled}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${acquireButton.btnClass}`}
          >
            {acquireButton.label}
          </button>
        </div>
      </div>
    </div>
  )
}
