'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { encodeFunctionData, getAddress, isAddress } from 'viem'
import type { Abi } from 'viem'
import {
  BALANCE_CONTRACT_ABI,
  FUND_CONTRACT_ABI,
  PERP_NAV_CONTRACT_ABI,
} from '@/lib/abis'
import { getPublicClient } from '@/lib/client'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import {
  V2_ENCODED_ROLE_HASHES,
  V2_ENCODED_ROLE_LABELS,
  roleKeysForContract,
  type V2EncodedRoleKey,
} from '@/lib/v2-role-hashes'
import type { RolesV2ContractKey, RolesV2PageData } from '@/lib/roles-v2-reader'
import TransferProxyAdminSection from './TransferProxyAdminSection'

type Props = { data: RolesV2PageData }

type ExecMode = 'eoa' | 'safe'
type RoleAction = 'grant' | 'revoke'

const CONTRACT_ABIS: Record<RolesV2ContractKey, Abi> = {
  fund: FUND_CONTRACT_ABI,
  balance: BALANCE_CONTRACT_ABI,
  perpNav: PERP_NAV_CONTRACT_ABI,
}

function truncate(addr: string) {
  return truncateAddress(addr)
}

function formatRoleTxError(e: unknown): string {
  const err = e as { shortMessage?: string; cause?: { shortMessage?: string } }
  return err.cause?.shortMessage ?? err.shortMessage ?? 'Simulation failed'
}

type ButtonState = { label: string; disabled: boolean; className: string }

function buildButtonState(
  action: RoleAction,
  mode: ExecMode,
  opts: {
    isConnected: boolean
    isWrongChain: boolean
    formValid: boolean
    canExecute: boolean
    actionAllowed: boolean
    busy: boolean
    success: boolean
    errored: boolean
  },
): ButtonState {
  const grantLabel = mode === 'eoa' ? 'Grant role' : 'Propose grant'
  const revokeLabel = mode === 'eoa' ? 'Revoke role' : 'Propose revoke'
  const labelBase = action === 'grant' ? grantLabel : revokeLabel
  const blue = 'bg-blue-600 text-white hover:bg-blue-700'
  const red = 'bg-red-600 text-white hover:bg-red-700'
  const disabledGrant =
    'bg-neutral-200 text-neutral-500 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-400'
  const disabledRevoke =
    'border border-red-300 bg-red-50 text-red-500 cursor-not-allowed dark:border-red-900 dark:bg-red-950/30 dark:text-red-400'

  const idleClass = action === 'grant' ? blue : red
  const disabledClass = action === 'grant' ? disabledGrant : disabledRevoke

  if (!opts.isConnected || opts.isWrongChain || !opts.formValid || !opts.canExecute || !opts.actionAllowed) {
    return { label: labelBase, disabled: true, className: disabledClass }
  }
  if (opts.busy) {
    return { label: 'Working…', disabled: true, className: idleClass }
  }
  if (opts.success) {
    const eoaDone =
      action === 'grant' ? '✓ Granted — Retry' : '✓ Revoked — Retry'
    const safeDone =
      action === 'grant' ? '✓ Grant proposed' : '✓ Revoke proposed'
    return {
      label: mode === 'eoa' ? eoaDone : safeDone,
      disabled: mode !== 'eoa',
      className: mode === 'eoa' ? idleClass : 'bg-green-600 text-white cursor-not-allowed',
    }
  }
  if (opts.errored) {
    return { label: `${labelBase} — Retry`, disabled: false, className: idleClass }
  }
  return { label: labelBase, disabled: false, className: idleClass }
}

export default function RolesV2Client({ data }: Props) {
  const { address, isConnected, chainId } = useAccount()
  const isWrongChain = isConnected && chainId !== 999

  const configuredContracts = data.contracts.filter((c) => c.configured)
  const defaultContractKey = configuredContracts[0]?.key ?? 'fund'

  const [contractKey, setContractKey] = useState<RolesV2ContractKey>(defaultContractKey)
  const availableRoleKeys = useMemo(() => roleKeysForContract(contractKey), [contractKey])
  const [roleKey, setRoleKey] = useState<V2EncodedRoleKey>(availableRoleKeys[0])
  const [accountInput, setAccountInput] = useState('')
  const [execMode, setExecMode] = useState<ExecMode>('eoa')
  const [safeAddress, setSafeAddress] = useState(data.safes[0]?.address ?? '')
  const [lastEoaAction, setLastEoaAction] = useState<RoleAction | null>(null)
  const [grantSimError, setGrantSimError] = useState<string | null>(null)
  const [revokeSimError, setRevokeSimError] = useState<string | null>(null)
  const [grantRevertError, setGrantRevertError] = useState<string | null>(null)
  const [revokeRevertError, setRevokeRevertError] = useState<string | null>(null)
  const [roleSimulating, setRoleSimulating] = useState<RoleAction | null>(null)

  const selectedContract = data.contracts.find((c) => c.key === contractKey)
  const contractAddress = selectedContract?.configured
    ? (getAddress(selectedContract.address) as `0x${string}`)
    : undefined
  const roleHash = V2_ENCODED_ROLE_HASHES[roleKey]
  const contractAbi = CONTRACT_ABIS[contractKey]

  const accountTrimmed = accountInput.trim()
  const accountValid = accountTrimmed !== '' && isAddress(accountTrimmed)
  const normalizedAccount = accountValid ? (getAddress(accountTrimmed) as `0x${string}`) : undefined

  const safeAddr =
    safeAddress && isAddress(safeAddress) ? (getAddress(safeAddress) as `0x${string}`) : undefined
  const { data: safeInfo } = useSafeInfo(execMode === 'safe' ? safeAddr : undefined)
  const isSafeOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const { data: accountHasRole, refetch: refetchHasRole } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'hasRole',
    args: normalizedAccount && contractAddress ? [roleHash, normalizedAccount] : undefined,
    query: { enabled: Boolean(contractAddress && normalizedAccount) },
  })

  const { data: eoaCanAdmin } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'hasRole',
    args: address && contractAddress ? [V2_ENCODED_ROLE_HASHES.ADMIN, address] : undefined,
    query: { enabled: execMode === 'eoa' && Boolean(contractAddress && address) },
  })

  const grantProposeTx = useProposeSafeTransaction(safeAddr)
  const revokeProposeTx = useProposeSafeTransaction(safeAddr)

  const {
    writeContract,
    data: eoaTxHash,
    isPending: eoaIsPending,
    isError: eoaIsError,
    error: eoaError,
    reset: resetEoa,
  } = useWriteContract()
  const {
    isLoading: eoaIsConfirming,
    isSuccess: eoaIsConfirmed,
    data: eoaReceipt,
  } = useWaitForTransactionReceipt({
    hash: eoaTxHash,
    query: { enabled: Boolean(eoaTxHash) },
  })
  const eoaSucceeded = eoaIsConfirmed && eoaReceipt?.status === 'success'
  const eoaReverted = eoaIsConfirmed && eoaReceipt?.status === 'reverted'

  useEffect(() => {
    if (!configuredContracts.some((c) => c.key === contractKey)) {
      setContractKey(defaultContractKey)
    }
  }, [contractKey, configuredContracts, defaultContractKey])

  useEffect(() => {
    if (!availableRoleKeys.includes(roleKey)) {
      setRoleKey(availableRoleKeys[0])
    }
  }, [availableRoleKeys, roleKey])

  useEffect(() => {
    if (eoaSucceeded) {
      refetchHasRole()
      setGrantSimError(null)
      setRevokeSimError(null)
      setGrantRevertError(null)
      setRevokeRevertError(null)
    }
    if (eoaReverted && lastEoaAction === 'grant') {
      setGrantRevertError('Transaction reverted on-chain. Role was not granted.')
    }
    if (eoaReverted && lastEoaAction === 'revoke') {
      setRevokeRevertError('Transaction reverted on-chain. Role was not revoked.')
    }
  }, [eoaSucceeded, eoaReverted, lastEoaAction, refetchHasRole])

  const formValid = Boolean(accountValid && contractAddress)
  const canExecuteEoa = isConnected && !isWrongChain && eoaCanAdmin === true
  const canExecuteSafe = isConnected && !isWrongChain && isSafeOwner && Boolean(safeAddr)
  const canExecute = execMode === 'eoa' ? canExecuteEoa : canExecuteSafe

  const canGrant = formValid && canExecute && accountHasRole === false
  const canRevoke = formValid && canExecute && accountHasRole === true

  const eoaGrantSuccess = eoaSucceeded && lastEoaAction === 'grant'
  const eoaRevokeSuccess = eoaSucceeded && lastEoaAction === 'revoke'
  const eoaGrantError =
    Boolean(grantSimError || grantRevertError) ||
    (eoaIsError && lastEoaAction === 'grant') ||
    (eoaReverted && lastEoaAction === 'grant')
  const eoaRevokeError =
    Boolean(revokeSimError || revokeRevertError) ||
    (eoaIsError && lastEoaAction === 'revoke') ||
    (eoaReverted && lastEoaAction === 'revoke')

  function resetTxState() {
    resetEoa()
    setLastEoaAction(null)
    setGrantSimError(null)
    setRevokeSimError(null)
    setGrantRevertError(null)
    setRevokeRevertError(null)
    setRoleSimulating(null)
    grantProposeTx.reset()
    revokeProposeTx.reset()
  }

  async function handleGrantEoa() {
    if (!canGrant || !contractAddress || !normalizedAccount || !address) return
    setLastEoaAction('grant')
    setGrantSimError(null)
    setGrantRevertError(null)
    resetEoa()
    setRoleSimulating('grant')
    try {
      const client = getPublicClient()
      await client.simulateContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'grantRole',
        args: [roleHash, normalizedAccount],
        account: address as `0x${string}`,
      })
    } catch (e) {
      setGrantSimError(formatRoleTxError(e))
      setRoleSimulating(null)
      return
    }
    setRoleSimulating(null)
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'grantRole',
      args: [roleHash, normalizedAccount],
    })
  }

  async function handleRevokeEoa() {
    if (!canRevoke || !contractAddress || !normalizedAccount || !address) return
    setLastEoaAction('revoke')
    setRevokeSimError(null)
    setRevokeRevertError(null)
    resetEoa()
    setRoleSimulating('revoke')
    try {
      const client = getPublicClient()
      await client.simulateContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'revokeRole',
        args: [roleHash, normalizedAccount],
        account: address as `0x${string}`,
      })
    } catch (e) {
      setRevokeSimError(formatRoleTxError(e))
      setRoleSimulating(null)
      return
    }
    setRoleSimulating(null)
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'revokeRole',
      args: [roleHash, normalizedAccount],
    })
  }

  function handleGrantSafe() {
    if (!canGrant || !contractAddress || !normalizedAccount) return
    grantProposeTx.reset()
    const calldata = encodeFunctionData({
      abi: contractAbi,
      functionName: 'grantRole',
      args: [roleHash, normalizedAccount],
    })
    grantProposeTx.mutate({ to: contractAddress, data: calldata })
  }

  function handleRevokeSafe() {
    if (!canRevoke || !contractAddress || !normalizedAccount) return
    revokeProposeTx.reset()
    const calldata = encodeFunctionData({
      abi: contractAbi,
      functionName: 'revokeRole',
      args: [roleHash, normalizedAccount],
    })
    revokeProposeTx.mutate({ to: contractAddress, data: calldata })
  }

  const grantBtn = buildButtonState('grant', execMode, {
    isConnected,
    isWrongChain,
    formValid,
    canExecute,
    actionAllowed: canGrant,
    busy:
      roleSimulating === 'grant' ||
      ((eoaIsPending || eoaIsConfirming) && lastEoaAction === 'grant') ||
      (execMode === 'safe' && grantProposeTx.isPending),
    success: execMode === 'eoa' ? eoaGrantSuccess : grantProposeTx.isSuccess,
    errored: execMode === 'eoa' ? eoaGrantError : grantProposeTx.isError,
  })

  const revokeBtn = buildButtonState('revoke', execMode, {
    isConnected,
    isWrongChain,
    formValid,
    canExecute,
    actionAllowed: canRevoke,
    busy:
      roleSimulating === 'revoke' ||
      ((eoaIsPending || eoaIsConfirming) && lastEoaAction === 'revoke') ||
      (execMode === 'safe' && revokeProposeTx.isPending),
    success: execMode === 'eoa' ? eoaRevokeSuccess : revokeProposeTx.isSuccess,
    errored: execMode === 'eoa' ? eoaRevokeError : revokeProposeTx.isError,
  })

  const grantError =
    grantSimError ??
    grantRevertError ??
    (execMode === 'eoa' && lastEoaAction === 'grant' && eoaError ? eoaError.message : null) ??
    (execMode === 'safe' ? grantProposeTx.error?.message : null)

  const revokeError =
    revokeSimError ??
    revokeRevertError ??
    (execMode === 'eoa' && lastEoaAction === 'revoke' && eoaError ? eoaError.message : null) ??
    (execMode === 'safe' ? revokeProposeTx.error?.message : null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Roles Management</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Grant or revoke roles on v2 contracts via connected wallet (EOA) or Safe proposal.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">Grant / Revoke Role</h2>

        <div className="mb-4 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
          <p className="font-medium text-neutral-700 dark:text-neutral-300">Roles per contract</p>
          <ul className="mt-1 space-y-0.5">
            <li>Fund — ADMIN, UPGRADER</li>
            <li>Balance — ADMIN, OPERATOR</li>
            <li>Perp NAV — ADMIN</li>
          </ul>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="v2-contract" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
              Contract
            </label>
            <select
              id="v2-contract"
              value={contractKey}
              onChange={(e) => {
                setContractKey(e.target.value as RolesV2ContractKey)
                resetTxState()
              }}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              {data.contracts.map((c) => (
                <option key={c.key} value={c.key} disabled={!c.configured}>
                  {c.label}{!c.configured ? ' (not configured)' : ''}
                </option>
              ))}
            </select>
            {selectedContract && (
              <p className="mt-1 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                {truncate(selectedContract.address)}
                <CopyButton value={selectedContract.address} />
              </p>
            )}
          </div>

          <div>
            <label htmlFor="v2-role" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
              Role
            </label>
            <select
              id="v2-role"
              value={roleKey}
              onChange={(e) => {
                setRoleKey(e.target.value as V2EncodedRoleKey)
                resetTxState()
              }}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              {availableRoleKeys.map((key) => (
                <option key={key} value={key}>{V2_ENCODED_ROLE_LABELS[key]}</option>
              ))}
            </select>
            <p className="mt-1 font-mono text-xs text-neutral-500 dark:text-neutral-400">{roleHash}</p>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="v2-account" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
            Account
          </label>
          <input
            id="v2-account"
            type="text"
            placeholder="0x…"
            value={accountInput}
            onChange={(e) => {
              setAccountInput(e.target.value)
              resetTxState()
            }}
            className="w-full max-w-xl rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
          />
          {accountTrimmed && !accountValid && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Invalid address</p>
          )}
          {accountValid && accountHasRole === undefined && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Checking role status…</p>
          )}
          {accountValid && accountHasRole === true && (
            <p className="mt-1 text-xs text-green-700 dark:text-green-400">
              Account has {V2_ENCODED_ROLE_LABELS[roleKey]} on this contract — use Revoke role to remove it.
            </p>
          )}
          {accountValid && accountHasRole === false && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Account does not have {V2_ENCODED_ROLE_LABELS[roleKey]} — use Grant role to assign it.
            </p>
          )}
        </div>

        <div className="mb-4">
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Execute as</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="exec-mode"
                checked={execMode === 'eoa'}
                onChange={() => {
                  setExecMode('eoa')
                  resetTxState()
                }}
              />
              Connected wallet (EOA)
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="exec-mode"
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
              Caller: {truncate(address)}
              {eoaCanAdmin === false && ' — wallet does not hold ADMIN on this contract'}
              {eoaCanAdmin === true && ' — wallet holds ADMIN on this contract'}
            </p>
          )}
          {execMode === 'safe' && (
            <div className="mt-2">
              <select
                value={safeAddress}
                onChange={(e) => {
                  setSafeAddress(e.target.value)
                  resetTxState()
                }}
                className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              >
                {data.safes.map((s) => (
                  <option key={s.address} value={s.address}>
                    {s.label} ({truncate(s.address)})
                  </option>
                ))}
              </select>
              {safeAddr && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {isSafeOwner ? 'You are a Safe owner' : 'You are not an owner of this Safe'}
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">grantRole(role, account)</code> assigns the
          role;{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">revokeRole(role, account)</code> removes it.
          Caller must hold{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ADMIN</code> on the selected contract.
          Role hashes use{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">keccak256(abi.encode(&quot;ROLE&quot;))</code>.
        </p>

        {!isConnected && (
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">Connect wallet to grant or revoke roles.</p>
        )}
        {isConnected && isWrongChain && (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">Switch to HyperEVM (chain 999).</p>
        )}
        {formValid && !canExecute && (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
            {execMode === 'eoa'
              ? 'Connected wallet does not hold ADMIN on this contract — switch to Safe (propose) or connect an admin wallet.'
              : 'You are not an owner of the selected Safe.'}
          </p>
        )}
        {formValid && canExecute && accountHasRole === false && (
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
            Grant is available. Revoke is disabled until the account holds this role.
          </p>
        )}
        {formValid && canExecute && accountHasRole === true && (
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
            Revoke is available. Grant is disabled because the account already has this role.
          </p>
        )}

        <div className="flex flex-wrap items-start gap-3">
          {grantError && (
            <span className="max-w-md truncate text-xs text-red-600 dark:text-red-400" title={grantError}>
              Grant: {grantError}
            </span>
          )}
          {revokeError && (
            <span className="max-w-md truncate text-xs text-red-600 dark:text-red-400" title={revokeError}>
              Revoke: {revokeError}
            </span>
          )}

          {(grantProposeTx.isSuccess || revokeProposeTx.isSuccess) && execMode === 'safe' && (
            <Link href="/safe-transactions" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              View pending →
            </Link>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={execMode === 'eoa' ? handleGrantEoa : handleGrantSafe}
              disabled={grantBtn.disabled}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${grantBtn.className}`}
            >
              {grantBtn.label}
            </button>
            <button
              type="button"
              onClick={execMode === 'eoa' ? handleRevokeEoa : handleRevokeSafe}
              disabled={revokeBtn.disabled}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${revokeBtn.className}`}
            >
              {revokeBtn.label}
            </button>
          </div>
        </div>
      </div>

      <TransferProxyAdminSection proxyAdmins={data.proxyAdmins} safes={data.safes} />
    </div>
  )
}
