'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { encodeFunctionData, getAddress, isAddress, parseUnits } from 'viem'
import { BALANCE_CONTRACT_ABI, FUND_CONTRACT_ABI } from '@/lib/abis'
import { getPublicClient } from '@/lib/client'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { getDefaultSafeAddress, getSafeAddressForRole } from '@/lib/safe/roles'
import { useVaultConfig } from '@/lib/vault-context'
import { formatTokenAmount, truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import StrategiesV2RoleBanner from './StrategiesV2RoleBanner'
import { V2_ENCODED_ROLE_HASHES } from '@/lib/v2-role-hashes'
import type { StrategyV2PageData } from '@/lib/strategy-v2-reader'

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

type Props = { data: StrategyV2PageData }
type ExecMode = 'eoa' | 'safe'
type OperatorEoaAction = 'transfer' | 'approve' | 'acquire'
type ActionTxState = { isPending: boolean; isSuccess: boolean; isError: boolean }

type SafeOption = { label: string; address: string }

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
  invalidLabel = 'Enter amount',
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
  INVALID_ROLE:
    'INVALID_ROLE: caller does not hold OPERATOR_ROLE on the balance contract.',
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

function sanitizeDecimalInput(value: string): string {
  let result = ''
  let seenDot = false
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') result += ch
    else if (ch === '.' && !seenDot) {
      seenDot = true
      result += ch
    }
  }
  return result
}

function parseUserAddresses(rows: string[]): { users: `0x${string}`[]; error?: string } {
  const users: `0x${string}`[] = []
  for (const row of rows) {
    const trimmed = row.trim()
    if (!trimmed) continue
    if (!isAddress(trimmed)) {
      return { users: [], error: `Invalid address: ${trimmed}` }
    }
    users.push(getAddress(trimmed) as `0x${string}`)
  }
  return { users }
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
    <div className="mb-4">
      <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Execute as</p>
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
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Caller: {truncateAddress(walletAddress)}
          {walletHasRole === false && ` — wallet does not hold ${roleLabel} on balance contract`}
          {walletHasRole === true && ` — wallet holds ${roleLabel} on balance contract`}
        </p>
      )}
      {mode === 'safe' && (
        <div className="mt-2">
          <select
            value={safeAddress}
            onChange={(e) => onSafeChange(e.target.value)}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {safeOptions.map((s) => (
              <option key={s.address} value={s.address}>
                {s.label} ({truncateAddress(s.address)})
              </option>
            ))}
          </select>
          {safeAddr && (
            <>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {isSafeOwner ? 'You are a Safe owner' : 'You are not an owner of this Safe'}
                {safeHasRole === true && ` — Safe holds ${roleLabel} on balance contract`}
                {safeHasRole === false &&
                  ` — Safe does not hold ${roleLabel} on balance contract (required for propose)`}
              </p>
              {isSafeOwner && safeHasRole === false && walletHasRole === true && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Your wallet holds {roleLabel} but this Safe does not. Switch to Connected wallet
                  (EOA) above, or grant {roleLabel} to this Safe on the Roles page.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function StrategiesV2Client({ data }: Props) {
  const config = useVaultConfig()
  const { address, isConnected, chainId } = useAccount()

  const operatorSafeOptions = useMemo(() => buildRoleSafeOptions(config, 'operator'), [config])

  const [operatorExecMode, setOperatorExecMode] = useState<ExecMode>('eoa')
  const [operatorSafeAddress, setOperatorSafeAddress] = useState(
    operatorSafeOptions[0]?.address ?? '',
  )
  const [lastOperatorEoaAction, setLastOperatorEoaAction] = useState<OperatorEoaAction | null>(
    null,
  )
  const [approveSimError, setApproveSimError] = useState<string | null>(null)
  const [transferSimError, setTransferSimError] = useState<string | null>(null)
  const [approveRevertError, setApproveRevertError] = useState<string | null>(null)
  const [transferRevertError, setTransferRevertError] = useState<string | null>(null)
  const [operatorSimulating, setOperatorSimulating] = useState<OperatorEoaAction | null>(null)
  const [acquireSimError, setAcquireSimError] = useState<string | null>(null)
  const [acquireRevertError, setAcquireRevertError] = useState<string | null>(null)
  const [acquireSimulating, setAcquireSimulating] = useState(false)
  const [acquireUserLockedShares, setAcquireUserLockedShares] = useState<
    { user: `0x${string}`; shares: bigint }[] | null
  >(null)

  const [amountInput, setAmountInput] = useState('')
  const [transferAmountInput, setTransferAmountInput] = useState('')
  const [transferReceiverInput, setTransferReceiverInput] = useState('')
  const [acquireAmountInput, setAcquireAmountInput] = useState('')
  const [acquireUserRows, setAcquireUserRows] = useState<string[]>([''])

  const balanceContractAddress = getAddress(data.balanceContractAddress) as `0x${string}`
  const fundContractAddress = getAddress(data.fundContractAddress) as `0x${string}`
  const underlyingAssetAddress = getAddress(data.underlyingAssetAddress) as `0x${string}`
  const decimals = data.underlyingDecimals

  const operatorRole = V2_ENCODED_ROLE_HASHES.OPERATOR

  const bannerOperatorSafe = getSafeAddressForRole(config, 'operator')

  const operatorSafeAddr =
    operatorSafeAddress && isAddress(operatorSafeAddress)
      ? (getAddress(operatorSafeAddress) as `0x${string}`)
      : undefined

  const { data: operatorSafeInfo } = useSafeInfo(
    operatorExecMode === 'safe' ? operatorSafeAddr : undefined,
  )

  const operatorIsSafeOwner = Boolean(
    address && operatorSafeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const { data: walletHasOperator } = useReadContract({
    address: balanceContractAddress,
    abi: BALANCE_CONTRACT_ABI,
    functionName: 'hasRole',
    args: address ? [operatorRole, address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { data: operatorSafeHasRole } = useReadContract({
    address: balanceContractAddress,
    abi: BALANCE_CONTRACT_ABI,
    functionName: 'hasRole',
    args: operatorSafeAddr ? [operatorRole, operatorSafeAddr] : undefined,
    query: { enabled: Boolean(operatorSafeAddr) },
  })

  const { data: bannerOperatorSafeHasRole } = useReadContract({
    address: balanceContractAddress,
    abi: BALANCE_CONTRACT_ABI,
    functionName: 'hasRole',
    args: [operatorRole, bannerOperatorSafe],
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: underlyingAssetAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [balanceContractAddress, fundContractAddress],
  })

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: underlyingAssetAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [balanceContractAddress],
  })

  const approveProposeTx = useProposeSafeTransaction(operatorSafeAddr)
  const transferProposeTx = useProposeSafeTransaction(operatorSafeAddr)
  const acquireProposeTx = useProposeSafeTransaction(operatorSafeAddr)

  const {
    writeContract: writeOperatorContract,
    data: operatorEoaTxHash,
    isPending: operatorEoaIsPending,
    isError: operatorEoaIsError,
    error: operatorEoaError,
    reset: resetOperatorEoa,
  } = useWriteContract()
  const { isLoading: operatorEoaIsConfirming, isSuccess: operatorEoaIsConfirmed, data: operatorReceipt } =
    useWaitForTransactionReceipt({
      hash: operatorEoaTxHash,
      query: { enabled: Boolean(operatorEoaTxHash) },
    })
  const operatorEoaSucceeded =
    operatorEoaIsConfirmed && operatorReceipt?.status === 'success'
  const operatorEoaReverted =
    operatorEoaIsConfirmed && operatorReceipt?.status === 'reverted'

  useEffect(() => {
    if (operatorEoaSucceeded && lastOperatorEoaAction === 'approve') {
      refetchAllowance()
      refetchBalance()
      setApproveSimError(null)
      setApproveRevertError(null)
    }
    if (operatorEoaSucceeded && lastOperatorEoaAction === 'transfer') {
      refetchBalance()
      setTransferSimError(null)
      setTransferRevertError(null)
    }
    if (operatorEoaReverted && lastOperatorEoaAction === 'approve') {
      setApproveRevertError('Transaction reverted on-chain. Allowance was not updated.')
    }
    if (operatorEoaReverted && lastOperatorEoaAction === 'transfer') {
      setTransferRevertError('Transaction reverted on-chain. Transfer did not complete.')
    }
    if (operatorEoaSucceeded && lastOperatorEoaAction === 'acquire') {
      refetchBalance()
      setAcquireSimError(null)
      setAcquireRevertError(null)
    }
    if (operatorEoaReverted && lastOperatorEoaAction === 'acquire') {
      setAcquireRevertError('Transaction reverted on-chain. Acquire did not complete.')
    }
  }, [
    operatorEoaSucceeded,
    operatorEoaReverted,
    lastOperatorEoaAction,
    refetchAllowance,
    refetchBalance,
  ])

  const isWrongChain = isConnected && chainId !== 999

  const canExecuteOperator =
    operatorExecMode === 'eoa'
      ? walletHasOperator === true
      : operatorIsSafeOwner && operatorSafeHasRole === true

  const amountValid =
    amountInput.trim() !== '' && !Number.isNaN(Number(amountInput)) && Number(amountInput) > 0
  const transferAmountValid =
    transferAmountInput.trim() !== '' &&
    !Number.isNaN(Number(transferAmountInput)) &&
    Number(transferAmountInput) > 0
  const transferReceiverTrimmed = transferReceiverInput.trim()
  const transferReceiverValid =
    transferReceiverTrimmed !== '' && isAddress(transferReceiverTrimmed)
  const transferReceiverError =
    transferReceiverTrimmed !== '' && !isAddress(transferReceiverTrimmed)
      ? `Invalid address: ${transferReceiverTrimmed}`
      : undefined
  const acquireAmountValid =
    acquireAmountInput.trim() !== '' &&
    !Number.isNaN(Number(acquireAmountInput)) &&
    Number(acquireAmountInput) > 0
  const parsedAcquireUsers = parseUserAddresses(acquireUserRows)
  const acquireUsersValid = !parsedAcquireUsers.error
  const acquireUserAddressesKey = parsedAcquireUsers.users.join(',')

  useEffect(() => {
    if (!acquireUsersValid || !acquireUserAddressesKey) {
      setAcquireUserLockedShares(null)
      return
    }

    const users = acquireUserAddressesKey.split(',') as `0x${string}`[]
    let cancelled = false
    const client = getPublicClient()
    void Promise.all(
      users.map(async (user) => {
        const shares = await client.readContract({
          address: fundContractAddress,
          abi: FUND_CONTRACT_ABI,
          functionName: 'lockedShares',
          args: [user],
        })
        return { user, shares }
      }),
    )
      .then((rows) => {
        if (!cancelled) setAcquireUserLockedShares(rows)
      })
      .catch(() => {
        if (!cancelled) setAcquireUserLockedShares(null)
      })

    return () => {
      cancelled = true
    }
  }, [acquireUsersValid, acquireUserAddressesKey, fundContractAddress])

  function resetOperatorTxState() {
    resetOperatorEoa()
    setLastOperatorEoaAction(null)
    setApproveSimError(null)
    setTransferSimError(null)
    setApproveRevertError(null)
    setTransferRevertError(null)
    setAcquireSimError(null)
    setAcquireRevertError(null)
    setOperatorSimulating(null)
    setAcquireSimulating(false)
    approveProposeTx.reset()
    transferProposeTx.reset()
    acquireProposeTx.reset()
  }

  async function handleApprove() {
    if (!amountValid) return
    setLastOperatorEoaAction('approve')
    setApproveSimError(null)
    setApproveRevertError(null)
    resetOperatorEoa()

    const amount = parseUnits(amountInput.trim(), decimals)
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [fundContractAddress, amount],
    })
    const executeData = encodeFunctionData({
      abi: BALANCE_CONTRACT_ABI,
      functionName: 'executeAction',
      args: [underlyingAssetAddress, 0n, approveData],
    })

    if (operatorExecMode === 'eoa') {
      if (!address) return
      setOperatorSimulating('approve')
      try {
        const client = getPublicClient()
        await client.simulateContract({
          address: balanceContractAddress,
          abi: BALANCE_CONTRACT_ABI,
          functionName: 'executeAction',
          args: [underlyingAssetAddress, 0n, approveData],
          account: address as `0x${string}`,
        })
      } catch (e) {
        setApproveSimError(formatExecuteActionError(e))
        setOperatorSimulating(null)
        return
      }
      setOperatorSimulating(null)
      writeOperatorContract({
        address: balanceContractAddress,
        abi: BALANCE_CONTRACT_ABI,
        functionName: 'executeAction',
        args: [underlyingAssetAddress, 0n, approveData],
      })
    } else {
      approveProposeTx.reset()
      approveProposeTx.mutate({ to: balanceContractAddress, data: executeData })
    }
  }

  async function handleTransfer() {
    if (!transferAmountValid || !transferReceiverValid) return
    setLastOperatorEoaAction('transfer')
    setTransferSimError(null)
    setTransferRevertError(null)
    resetOperatorEoa()

    const amount = parseUnits(transferAmountInput.trim(), decimals)
    const receiver = getAddress(transferReceiverTrimmed) as `0x${string}`
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [receiver, amount],
    })
    const executeData = encodeFunctionData({
      abi: BALANCE_CONTRACT_ABI,
      functionName: 'executeAction',
      args: [underlyingAssetAddress, 0n, transferData],
    })

    if (operatorExecMode === 'eoa') {
      if (!address) return
      setOperatorSimulating('transfer')
      try {
        const client = getPublicClient()
        await client.simulateContract({
          address: balanceContractAddress,
          abi: BALANCE_CONTRACT_ABI,
          functionName: 'executeAction',
          args: [underlyingAssetAddress, 0n, transferData],
          account: address as `0x${string}`,
        })
      } catch (e) {
        setTransferSimError(formatExecuteActionError(e))
        setOperatorSimulating(null)
        return
      }
      setOperatorSimulating(null)
      writeOperatorContract({
        address: balanceContractAddress,
        abi: BALANCE_CONTRACT_ABI,
        functionName: 'executeAction',
        args: [underlyingAssetAddress, 0n, transferData],
      })
    } else {
      transferProposeTx.reset()
      transferProposeTx.mutate({ to: balanceContractAddress, data: executeData })
    }
  }

  async function handleAcquire() {
    if (!acquireAmountValid || !acquireUsersValid) return
    setLastOperatorEoaAction('acquire')
    setAcquireSimError(null)
    setAcquireRevertError(null)
    resetOperatorEoa()

    const amount = parseUnits(acquireAmountInput.trim(), decimals)
    const users = parsedAcquireUsers.users
    const fees = users.map(() => 0n)
    const acquireData = encodeFunctionData({
      abi: FUND_CONTRACT_ABI,
      functionName: 'acquireWithdrawalFunds',
      args: [amount, users, fees],
    })
    const executeData = encodeFunctionData({
      abi: BALANCE_CONTRACT_ABI,
      functionName: 'executeAction',
      args: [fundContractAddress, 0n, acquireData],
    })

    if (operatorExecMode === 'eoa') {
      if (!address) return
      setAcquireSimulating(true)
      try {
        const client = getPublicClient()
        await client.simulateContract({
          address: balanceContractAddress,
          abi: BALANCE_CONTRACT_ABI,
          functionName: 'executeAction',
          args: [fundContractAddress, 0n, acquireData],
          account: address as `0x${string}`,
        })
      } catch (e) {
        setAcquireSimError(formatExecuteActionError(e))
        setAcquireSimulating(false)
        return
      }
      setAcquireSimulating(false)
      writeOperatorContract({
        address: balanceContractAddress,
        abi: BALANCE_CONTRACT_ABI,
        functionName: 'executeAction',
        args: [fundContractAddress, 0n, acquireData],
      })
    } else {
      acquireProposeTx.reset()
      acquireProposeTx.mutate({ to: balanceContractAddress, data: executeData })
    }
  }

  const approveEoaState: ActionTxState = {
    isPending:
      operatorSimulating === 'approve' ||
      ((operatorEoaIsPending || operatorEoaIsConfirming) &&
        lastOperatorEoaAction === 'approve'),
    isSuccess: operatorEoaSucceeded && lastOperatorEoaAction === 'approve',
    isError:
      Boolean(approveSimError || approveRevertError) ||
      (operatorEoaIsError && lastOperatorEoaAction === 'approve') ||
      (operatorEoaReverted && lastOperatorEoaAction === 'approve'),
  }
  const transferEoaState: ActionTxState = {
    isPending:
      operatorSimulating === 'transfer' ||
      ((operatorEoaIsPending || operatorEoaIsConfirming) &&
        lastOperatorEoaAction === 'transfer'),
    isSuccess: operatorEoaSucceeded && lastOperatorEoaAction === 'transfer',
    isError:
      Boolean(transferSimError || transferRevertError) ||
      (operatorEoaIsError && lastOperatorEoaAction === 'transfer') ||
      (operatorEoaReverted && lastOperatorEoaAction === 'transfer'),
  }
  const acquireEoaState: ActionTxState = {
    isPending:
      acquireSimulating ||
      ((operatorEoaIsPending || operatorEoaIsConfirming) &&
        lastOperatorEoaAction === 'acquire'),
    isSuccess: operatorEoaSucceeded && lastOperatorEoaAction === 'acquire',
    isError:
      Boolean(acquireSimError || acquireRevertError) ||
      (operatorEoaIsError && lastOperatorEoaAction === 'acquire') ||
      (operatorEoaReverted && lastOperatorEoaAction === 'acquire'),
  }

  const approveTxState: ActionTxState =
    operatorExecMode === 'eoa'
      ? approveEoaState
      : {
          isPending: approveProposeTx.isPending,
          isSuccess: approveProposeTx.isSuccess,
          isError: approveProposeTx.isError,
        }

  const transferTxState: ActionTxState =
    operatorExecMode === 'eoa'
      ? transferEoaState
      : {
          isPending: transferProposeTx.isPending,
          isSuccess: transferProposeTx.isSuccess,
          isError: transferProposeTx.isError,
        }

  const acquireTxState: ActionTxState =
    operatorExecMode === 'eoa'
      ? acquireEoaState
      : {
          isPending: acquireProposeTx.isPending,
          isSuccess: acquireProposeTx.isSuccess,
          isError: acquireProposeTx.isError,
        }

  const transferFormValid = transferAmountValid && transferReceiverValid
  const acquireFormValid = acquireAmountValid && acquireUsersValid

  const acquireUsersWithoutPendingWithdraw =
    acquireUserLockedShares?.filter((row) => row.shares === 0n) ?? []

  const transferButton = getActionButtonState(
    operatorExecMode,
    'Transfer',
    isConnected,
    isWrongChain,
    canExecuteOperator,
    transferFormValid,
    transferTxState,
    'Complete form',
  )
  const approveButton = getActionButtonState(
    operatorExecMode,
    'Approve',
    isConnected,
    isWrongChain,
    canExecuteOperator,
    amountValid,
    approveTxState,
  )
  const acquireButton = getActionButtonState(
    operatorExecMode,
    'Acquire',
    isConnected,
    isWrongChain,
    canExecuteOperator,
    acquireFormValid,
    acquireTxState,
    'Complete form',
  )

  const transferError =
    transferSimError ??
    transferRevertError ??
    (operatorExecMode === 'eoa' && lastOperatorEoaAction === 'transfer' && operatorEoaError
      ? operatorEoaError.message
      : transferProposeTx.error?.message)
  const approveError =
    approveSimError ??
    approveRevertError ??
    (operatorExecMode === 'eoa' && lastOperatorEoaAction === 'approve' && operatorEoaError
      ? operatorEoaError.message
      : approveProposeTx.error?.message)
  const acquireError =
    acquireSimError ??
    acquireRevertError ??
    (operatorExecMode === 'eoa' &&
    lastOperatorEoaAction === 'acquire' &&
    operatorEoaError
      ? operatorEoaError.message
      : acquireProposeTx.error?.message)

  return (
    <div className="space-y-6">
      <StrategiesV2RoleBanner
        isConnected={isConnected}
        walletHasOperator={walletHasOperator === true}
        operatorSafe={bannerOperatorSafe}
        operatorSafeHasRole={bannerOperatorSafeHasRole === true}
      />

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Transfer Underlying Token
          </h2>
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            BalanceContract.executeAction()
          </span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Token ({data.underlyingSymbol})</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
              {truncateAddress(underlyingAssetAddress)}
              <CopyButton value={underlyingAssetAddress} />
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Balance Contract</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
              {truncateAddress(balanceContractAddress)}
              <CopyButton value={balanceContractAddress} />
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Balance on Balance Contract</p>
            <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
              {balance !== undefined
                ? formatTokenAmount(balance.toString(), decimals)
                : '—'}
              <span className="ml-1 text-xs font-normal text-neutral-500">{data.underlyingSymbol}</span>
            </p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="transfer-amount"
              className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
            >
              Amount ({data.underlyingSymbol})
            </label>
            <input
              id="transfer-amount"
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={transferAmountInput}
              onChange={(e) => setTransferAmountInput(sanitizeDecimalInput(e.target.value))}
              className="w-full max-w-xs rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm tabular-nums text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
            />
          </div>
          <div>
            <label
              htmlFor="transfer-receiver"
              className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
            >
              Receiver
            </label>
            <input
              id="transfer-receiver"
              type="text"
              placeholder="0x…"
              value={transferReceiverInput}
              onChange={(e) => setTransferReceiverInput(e.target.value)}
              className="w-full max-w-xs rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
            />
            {transferReceiverError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{transferReceiverError}</p>
            )}
          </div>
        </div>

        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Runs{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">executeAction()</code>{' '}
          on the balance contract with inner calldata{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            transfer(receiver, amount)
          </code>{' '}
          on the underlying token. Caller must hold{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">OPERATOR_ROLE</code>{' '}
          on the balance contract. An admin must whitelist{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">transfer()</code>{' '}
          on this token via{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">approveAction()</code>{' '}
          before operators can run it.
        </p>

        <ExecuteAsSection
          name="operator-exec-transfer"
          mode={operatorExecMode}
          onModeChange={(mode) => {
            setOperatorExecMode(mode)
            resetOperatorTxState()
          }}
          roleLabel="OPERATOR_ROLE"
          walletAddress={address}
          walletHasRole={walletHasOperator}
          safeOptions={operatorSafeOptions}
          safeAddress={operatorSafeAddress}
          onSafeChange={(addr) => {
            setOperatorSafeAddress(addr)
            resetOperatorTxState()
          }}
          isSafeOwner={operatorIsSafeOwner}
          safeHasRole={operatorSafeHasRole}
        />

        <div className="flex flex-wrap items-center gap-3">
          {transferError && (
            <span
              className="max-w-xl break-words text-xs text-red-600 dark:text-red-400"
              title={transferError}
            >
              {transferError}
            </span>
          )}

          {transferTxState.isPending && (
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

          {transferTxState.isSuccess && operatorExecMode === 'safe' && (
            <Link
              href="/safe-transactions"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View pending →
            </Link>
          )}

          <div className="ml-auto">
            <button
              onClick={handleTransfer}
              disabled={transferButton.disabled}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${transferButton.btnClass}`}
            >
              {transferButton.label}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Approve Underlying Token
          </h2>
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            BalanceContract.executeAction()
          </span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Token ({data.underlyingSymbol})</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
              {truncateAddress(underlyingAssetAddress)}
              <CopyButton value={underlyingAssetAddress} />
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Spender (Fund Contract)</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
              {truncateAddress(fundContractAddress)}
              <CopyButton value={fundContractAddress} />
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Balance Contract</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
              {truncateAddress(balanceContractAddress)}
              <CopyButton value={balanceContractAddress} />
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Balance on Balance Contract</p>
            <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
              {balance !== undefined
                ? formatTokenAmount(balance.toString(), decimals)
                : '—'}
              <span className="ml-1 text-xs font-normal text-neutral-500">{data.underlyingSymbol}</span>
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Current Allowance</p>
            <p className="mt-0.5 font-semibold tabular-nums text-neutral-900 dark:text-white">
              {allowance !== undefined
                ? formatTokenAmount(allowance.toString(), decimals)
                : '—'}
              <span className="ml-1 text-xs font-normal text-neutral-500">{data.underlyingSymbol}</span>
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label
            htmlFor="approve-amount"
            className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
          >
            Amount to approve ({data.underlyingSymbol})
          </label>
          <input
            id="approve-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amountInput}
            onChange={(e) => setAmountInput(sanitizeDecimalInput(e.target.value))}
            className="w-full max-w-xs rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
          />
        </div>

        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Runs{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">executeAction()</code>{' '}
          on the balance contract with inner calldata{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            approve({truncateAddress(fundContractAddress)}, amount)
          </code>{' '}
          on the underlying token. Caller must hold{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">OPERATOR_ROLE</code>{' '}
          on the balance contract. An admin must whitelist{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">approve()</code>{' '}
          on this token via{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">approveAction()</code>{' '}
          before operators can run it.
        </p>

        <ExecuteAsSection
          name="operator-exec-approve"
          mode={operatorExecMode}
          onModeChange={(mode) => {
            setOperatorExecMode(mode)
            resetOperatorTxState()
          }}
          roleLabel="OPERATOR_ROLE"
          walletAddress={address}
          walletHasRole={walletHasOperator}
          safeOptions={operatorSafeOptions}
          safeAddress={operatorSafeAddress}
          onSafeChange={(addr) => {
            setOperatorSafeAddress(addr)
            resetOperatorTxState()
          }}
          isSafeOwner={operatorIsSafeOwner}
          safeHasRole={operatorSafeHasRole}
        />

        <div className="flex flex-wrap items-center gap-3">
          {approveError && (
            <span
              className="max-w-xl break-words text-xs text-red-600 dark:text-red-400"
              title={approveError}
            >
              {approveError}
            </span>
          )}

          {approveTxState.isPending && (
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

          {approveTxState.isSuccess && operatorExecMode === 'safe' && (
            <Link
              href="/safe-transactions"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View pending →
            </Link>
          )}

          <div className="ml-auto">
            <button
              onClick={handleApprove}
              disabled={approveButton.disabled}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${approveButton.btnClass}`}
            >
              {approveButton.label}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Acquire Withdrawal Funds
          </h2>
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            BalanceContract.executeAction()
          </span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Target (Fund Contract)</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
              {truncateAddress(fundContractAddress)}
              <CopyButton value={fundContractAddress} />
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Balance Contract</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
              {truncateAddress(balanceContractAddress)}
              <CopyButton value={balanceContractAddress} />
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">Asset ({data.underlyingSymbol})</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-900 dark:text-white">
              {truncateAddress(underlyingAssetAddress)}
              <CopyButton value={underlyingAssetAddress} />
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label
            htmlFor="acquire-amount"
            className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
          >
            Amount acquired ({data.underlyingSymbol})
          </label>
          <input
            id="acquire-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={acquireAmountInput}
            onChange={(e) => setAcquireAmountInput(sanitizeDecimalInput(e.target.value))}
            className="w-full max-w-xs rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm tabular-nums text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-neutral-600 dark:text-neutral-400">
            Users (<code className="rounded bg-neutral-100 px-1 text-xs dark:bg-neutral-800">_users</code>)
          </label>
          <div className="space-y-2">
            {acquireUserRows.map((row, index) => {
              const isLastRow = index === acquireUserRows.length - 1
              const rowActionClass =
                'shrink-0 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300'

              return (
                <div key={index} className="flex max-w-xl items-center gap-1">
                  <input
                    type="text"
                    placeholder="0x…"
                    value={row}
                    onChange={(e) => {
                      const value = e.target.value
                      setAcquireUserRows((rows) => rows.map((r, i) => (i === index ? value : r)))
                    }}
                    className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                  />
                  {isLastRow && (
                    <button
                      type="button"
                      onClick={() => setAcquireUserRows((rows) => [...rows, ''])}
                      className={rowActionClass}
                      title="Add user"
                      aria-label="Add user"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setAcquireUserRows((rows) =>
                        rows.length === 1 ? [''] : rows.filter((_, i) => i !== index),
                      )
                    }
                    className={rowActionClass}
                    title="Remove user"
                    aria-label="Remove user"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
          {parsedAcquireUsers.error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{parsedAcquireUsers.error}</p>
          )}
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {parsedAcquireUsers.users.length} user{parsedAcquireUsers.users.length === 1 ? '' : 's'} — fees
            default to 0 per user. Each user must have called{' '}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">initiateWithdrawal()</code>{' '}
            on the fund contract before acquire can succeed.
          </p>
          {acquireUsersWithoutPendingWithdraw.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {acquireUsersWithoutPendingWithdraw.length === parsedAcquireUsers.users.length
                ? 'None of the listed users have pending withdrawal (lockedShares = 0).'
                : `${acquireUsersWithoutPendingWithdraw.length} user(s) have no pending withdrawal (lockedShares = 0): ${acquireUsersWithoutPendingWithdraw
                    .map((row) => truncateAddress(row.user))
                    .join(', ')}.`}
            </p>
          )}
        </div>

        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Runs{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">executeAction()</code>{' '}
          on the balance contract with inner calldata{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            acquireWithdrawalFunds(amount, users, fees)
          </code>{' '}
          on the fund contract. Caller must hold{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">OPERATOR_ROLE</code>{' '}
          on the balance contract. An admin must whitelist{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            acquireWithdrawalFunds()
          </code>{' '}
          on the fund contract target via{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">approveAction()</code>{' '}
          on the balance contract before operators can run it.
        </p>

        <ExecuteAsSection
          name="operator-exec-acquire"
          mode={operatorExecMode}
          onModeChange={(mode) => {
            setOperatorExecMode(mode)
            resetOperatorTxState()
          }}
          roleLabel="OPERATOR_ROLE"
          walletAddress={address}
          walletHasRole={walletHasOperator}
          safeOptions={operatorSafeOptions}
          safeAddress={operatorSafeAddress}
          onSafeChange={(addr) => {
            setOperatorSafeAddress(addr)
            resetOperatorTxState()
          }}
          isSafeOwner={operatorIsSafeOwner}
          safeHasRole={operatorSafeHasRole}
        />

        <div className="flex flex-wrap items-center gap-3">
          {acquireError && (
            <span
              className="max-w-xl break-words text-xs text-red-600 dark:text-red-400"
              title={acquireError}
            >
              {acquireError}
            </span>
          )}

          {acquireTxState.isPending && (
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

          {acquireTxState.isSuccess && operatorExecMode === 'safe' && (
            <Link
              href="/safe-transactions"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View pending →
            </Link>
          )}

          <div className="ml-auto">
            <button
              onClick={handleAcquire}
              disabled={acquireButton.disabled}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${acquireButton.btnClass}`}
            >
              {acquireButton.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
