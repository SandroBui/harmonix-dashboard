'use client'

import { useState } from 'react'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { encodeFunctionData, isAddress, getAddress } from 'viem'
import { useProposeSafeTransaction } from '@/lib/safe/hooks'
import { useCountdown } from '@/lib/hooks/use-countdown'
import { ACCESS_MANAGER_ABI } from '@/lib/contracts'
import { ROLE_DESCRIPTIONS } from '@/lib/safe/roles'
import type { RoleInfo, AddressType } from '@/lib/roles-reader'

type Props = {
  roleInfo: RoleInfo
  accessManagerAddress: `0x${string}`
  adminSafeAddress: `0x${string}`
  isConnected: boolean
  isWrongChain: boolean
  isAdminSafeOwner: boolean
  adminHasRole: boolean
  sentinelHasRole: boolean
}

function TypeBadge({
  type,
  safeThreshold,
  safeSignerCount,
}: {
  type: AddressType
  safeThreshold?: number
  safeSignerCount?: number
}) {
  const styles: Record<AddressType, string> = {
    EOA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    Safe: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    Contract: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${styles[type]}`}>
        {type}
      </span>
      {type === 'Safe' && safeThreshold != null && safeSignerCount != null && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {safeThreshold}/{safeSignerCount} signers
        </span>
      )}
    </div>
  )
}

function truncateAddress(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return 'Disabled'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h < 24) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return `${d}d ${rh}h`
}

function formatTs(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
      title="Copy address"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  )
}

function RevokeButton({
  address,
  roleHash,
  accessManagerAddress,
  adminSafeAddress,
  isConnected,
  isWrongChain,
  isAdminSafeOwner,
  adminHasRole,
}: {
  address: `0x${string}`
  roleHash: `0x${string}`
  accessManagerAddress: `0x${string}`
  adminSafeAddress: `0x${string}`
  isConnected: boolean
  isWrongChain: boolean
  isAdminSafeOwner: boolean
  adminHasRole: boolean
}) {
  const proposeTx = useProposeSafeTransaction(adminSafeAddress)

  function handleRevoke() {
    const data = encodeFunctionData({
      abi: ACCESS_MANAGER_ABI,
      functionName: 'revokeRole',
      args: [roleHash, address],
    })
    proposeTx.mutate({ to: accessManagerAddress, data })
  }

  let label: string
  let disabled = false
  let cls = 'bg-red-600 text-white hover:bg-red-700'

  if (!isConnected) {
    label = 'Connect wallet'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    label = 'Wrong network'; disabled = true
    cls = 'bg-amber-100 text-amber-700 cursor-not-allowed dark:bg-amber-900/30 dark:text-amber-400'
  } else if (!isAdminSafeOwner) {
    label = 'Not a Safe owner'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!adminHasRole) {
    label = 'Safe lacks admin role'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    label = 'Confirm in wallet…'; disabled = true
  } else if (proposeTx.isSuccess) {
    label = '✓ Proposed'; disabled = true
    cls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    label = 'Failed — retry'
    cls = 'bg-red-700 text-white hover:bg-red-800'
  } else {
    label = 'Revoke'
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={disabled}
      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${cls} disabled:opacity-70`}
    >
      {label}
    </button>
  )
}

function CancelPendingGrantButton({
  roleHash,
  accessManagerAddress,
  isConnected,
  isWrongChain,
  sentinelHasRole,
}: {
  roleHash: `0x${string}`
  accessManagerAddress: `0x${string}`
  isConnected: boolean
  isWrongChain: boolean
  sentinelHasRole: boolean
}) {
  const { writeContract, data: txHash, isPending, isSuccess, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  })

  function handleCancelPending() {
    reset()
    writeContract({
      address: accessManagerAddress,
      abi: ACCESS_MANAGER_ABI,
      functionName: 'cancelPendingGrant',
      args: [roleHash],
    })
  }

  let label = 'Cancel pending grant'
  let disabled = false
  let cls = 'bg-amber-600 text-white hover:bg-amber-700'

  if (!isConnected) {
    label = 'Connect wallet'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    label = 'Wrong network'; disabled = true
    cls = 'bg-amber-100 text-amber-700 cursor-not-allowed dark:bg-amber-900/30 dark:text-amber-400'
  } else if (!sentinelHasRole) {
    label = 'No sentinel role'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isPending || isConfirming) {
    label = 'Confirm in wallet…'; disabled = true
  } else if (isSuccess) {
    label = '✓ Submitted'; disabled = true
    cls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (isError) {
    label = 'Failed — retry'
    cls = 'bg-amber-700 text-white hover:bg-amber-800'
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        onClick={handleCancelPending}
        disabled={disabled}
        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${cls} disabled:opacity-70`}
      >
        {label}
      </button>
      {isError && (
        <p className="max-w-xs truncate text-xs text-red-600 dark:text-red-400" title={error?.message}>
          {error?.message ?? 'Transaction failed'}
        </p>
      )}
    </div>
  )
}

function SetTimelockSection({
  roleHash,
  currentDelay,
  hasPendingGrant,
  accessManagerAddress,
  adminSafeAddress,
  isConnected,
  isWrongChain,
  isAdminSafeOwner,
  adminHasRole,
}: {
  roleHash: `0x${string}`
  currentDelay: number
  hasPendingGrant: boolean
  accessManagerAddress: `0x${string}`
  adminSafeAddress: `0x${string}`
  isConnected: boolean
  isWrongChain: boolean
  isAdminSafeOwner: boolean
  adminHasRole: boolean
}) {
  const [delayInput, setDelayInput] = useState(String(currentDelay))
  const proposeTx = useProposeSafeTransaction(adminSafeAddress)

  const validDelay = /^\d+$/.test(delayInput)
  const nextDelay = validDelay ? BigInt(delayInput) : 0n

  function handleSetTimelock() {
    if (!validDelay) return
    const data = encodeFunctionData({
      abi: ACCESS_MANAGER_ABI,
      functionName: 'setRoleTimelock',
      args: [roleHash, nextDelay],
    })
    proposeTx.mutate({ to: accessManagerAddress, data })
  }

  let btnLabel = 'Set timelock'
  let btnDisabled = false
  let btnCls = 'bg-indigo-600 text-white hover:bg-indigo-700'

  if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true
    btnCls = 'bg-amber-100 text-amber-700 cursor-not-allowed dark:bg-amber-900/30 dark:text-amber-400'
  } else if (!isAdminSafeOwner) {
    btnLabel = 'Not a Safe owner'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!adminHasRole) {
    btnLabel = 'Safe lacks admin role'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!validDelay) {
    btnLabel = 'Enter delay (seconds)'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm in wallet…'; btnDisabled = true
  } else if (proposeTx.isSuccess) {
    btnLabel = '✓ Proposed'; btnDisabled = true
    btnCls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    btnLabel = 'Failed — retry'
    btnCls = 'bg-indigo-700 text-white hover:bg-indigo-800'
  }

  return (
    <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
      <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">Set role timelock (seconds)</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={delayInput}
          onChange={(e) => {
            setDelayInput(e.target.value)
            proposeTx.reset?.()
          }}
          placeholder="0"
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500"
        />
        <button
          onClick={handleSetTimelock}
          disabled={btnDisabled}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${btnCls} disabled:opacity-70`}
        >
          {btnLabel}
        </button>
      </div>
      {hasPendingGrant && validDelay && nextDelay === 0n && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Pending grant exists. Cancel pending grant first before disabling timelock.
        </p>
      )}
      {proposeTx.isError && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          {proposeTx.error instanceof Error ? proposeTx.error.message : 'Transaction failed'}
        </p>
      )}
    </div>
  )
}

function GrantSection({
  roleInfo,
  accessManagerAddress,
  adminSafeAddress,
  isConnected,
  isWrongChain,
  isAdminSafeOwner,
  adminHasRole,
  pendingCountdown,
  pendingIsReady,
}: {
  roleInfo: RoleInfo
  accessManagerAddress: `0x${string}`
  adminSafeAddress: `0x${string}`
  isConnected: boolean
  isWrongChain: boolean
  isAdminSafeOwner: boolean
  adminHasRole: boolean
  pendingCountdown: string | null
  pendingIsReady: boolean
}) {
  const [newAddress, setNewAddress] = useState('')
  const proposeTx = useProposeSafeTransaction(adminSafeAddress)

  const addressValid = isAddress(newAddress)
  const normalizedAddress = addressValid ? (getAddress(newAddress) as `0x${string}`) : null
  const pendingGrant = roleInfo.pendingGrant
  const timelocked = roleInfo.timelockSeconds > 0
  const hasPendingGrant = Boolean(pendingGrant)
  const pendingMatchesInput = Boolean(
    normalizedAddress && pendingGrant && normalizedAddress.toLowerCase() === pendingGrant.account.toLowerCase(),
  )

  function handleGrant() {
    if (!normalizedAddress) return
    if (pendingGrant && !pendingMatchesInput) return

    const data = encodeFunctionData({
      abi: ACCESS_MANAGER_ABI,
      functionName: 'grantRole',
      args: [roleInfo.hash, normalizedAddress],
    })
    proposeTx.mutate({ to: accessManagerAddress, data })
  }

  let btnLabel = timelocked ? (hasPendingGrant ? 'Execute grant via Safe' : 'Schedule via Safe') : 'Grant via Safe'
  let btnDisabled = false
  let btnCls = 'bg-blue-600 text-white hover:bg-blue-700'

  if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true
    btnCls = 'bg-amber-100 text-amber-700 cursor-not-allowed dark:bg-amber-900/30 dark:text-amber-400'
  } else if (!isAdminSafeOwner) {
    btnLabel = 'Not a Safe owner'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!adminHasRole) {
    btnLabel = 'Safe lacks admin role'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!addressValid) {
    btnLabel = hasPendingGrant ? 'Enter pending address' : 'Enter valid address'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (hasPendingGrant && !pendingMatchesInput) {
    btnLabel = 'Pending for another address'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (hasPendingGrant && !pendingIsReady) {
    btnLabel = pendingCountdown && pendingCountdown !== 'Ready' ? `Ready in ${pendingCountdown}` : 'Pending timelock'
    btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm in wallet…'; btnDisabled = true
  } else if (proposeTx.isSuccess) {
    btnLabel = '✓ Proposed'; btnDisabled = true
    btnCls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    btnLabel = 'Failed — retry'
    btnCls = 'bg-blue-700 text-white hover:bg-blue-800'
  }

  return (
    <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
      <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">Grant role to address</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={newAddress}
          onChange={(e) => {
            setNewAddress(e.target.value)
            proposeTx.reset?.()
          }}
          placeholder={hasPendingGrant ? pendingGrant?.account ?? '0x…' : '0x…'}
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm text-neutral-900 placeholder-neutral-400 focus:border-blue-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500"
        />
        <button
          onClick={handleGrant}
          disabled={btnDisabled}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${btnCls} disabled:opacity-70`}
        >
          {btnLabel}
        </button>
      </div>
      {timelocked && !hasPendingGrant && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          First grant call schedules the role. After delay, call grant again for the same address to execute.
        </p>
      )}
      {pendingGrant && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Pending grant exists for {truncateAddress(pendingGrant.account)}.
          {!pendingIsReady && pendingCountdown && pendingCountdown !== 'Ready' ? ` Ready in ${pendingCountdown}.` : ''}
        </p>
      )}
      {proposeTx.isError && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          {proposeTx.error instanceof Error ? proposeTx.error.message : 'Transaction failed'}
        </p>
      )}
    </div>
  )
}

export default function RoleSection({
  roleInfo,
  accessManagerAddress,
  adminSafeAddress,
  isConnected,
  isWrongChain,
  isAdminSafeOwner,
  adminHasRole,
  sentinelHasRole,
}: Props) {
  const pendingCountdown = useCountdown(roleInfo.pendingGrant?.executableAt)
  const pendingIsReady = Boolean(roleInfo.pendingGrant && (pendingCountdown === 'Ready' || roleInfo.pendingGrant.isReady))

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="group relative inline-flex items-center gap-1.5">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              {roleInfo.label}
            </h2>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14" height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-neutral-400 dark:text-neutral-500"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <div className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 w-64 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 opacity-0 shadow-md transition-opacity group-hover:opacity-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {ROLE_DESCRIPTIONS[roleInfo.role]}
            </div>
          </div>
          <p className="mt-0.5 font-mono text-xs text-neutral-400 dark:text-neutral-500">
            {truncateAddress(roleInfo.hash)}
            <CopyButton value={roleInfo.hash} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {roleInfo.members.length} {roleInfo.members.length === 1 ? 'member' : 'members'}
          </span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            Timelock: {formatDuration(roleInfo.timelockSeconds)}
          </span>
        </div>
      </div>

      {roleInfo.members.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">No addresses have this role.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left dark:border-neutral-800">
              <th className="pb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Address</th>
              <th className="pb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Type</th>
              <th className="pb-2 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
            {roleInfo.members.map((member) => (
              <tr key={member.address}>
                <td className="py-2">
                  <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                    {truncateAddress(member.address)}
                  </span>
                  <CopyButton value={member.address} />
                </td>
                <td className="py-2">
                  <TypeBadge
                    type={member.type}
                    safeThreshold={member.safeThreshold}
                    safeSignerCount={member.safeSignerCount}
                  />
                </td>
                <td className="py-2 text-right">
                  <RevokeButton
                    address={member.address}
                    roleHash={roleInfo.hash}
                    accessManagerAddress={accessManagerAddress}
                    adminSafeAddress={adminSafeAddress}
                    isConnected={isConnected}
                    isWrongChain={isWrongChain}
                    isAdminSafeOwner={isAdminSafeOwner}
                    adminHasRole={adminHasRole}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {roleInfo.pendingGrant && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Pending grant</p>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {pendingIsReady ? 'Ready' : pendingCountdown && pendingCountdown !== 'Ready' ? `Ready in ${pendingCountdown}` : 'Pending'}
            </span>
          </div>
          <div className="space-y-1 text-xs text-neutral-700 dark:text-neutral-300">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">Account:</span>
              <span className="font-mono">{truncateAddress(roleInfo.pendingGrant.account)}</span>
              <CopyButton value={roleInfo.pendingGrant.account} />
              <TypeBadge
                type={roleInfo.pendingGrant.accountInfo.type}
                safeThreshold={roleInfo.pendingGrant.accountInfo.safeThreshold}
                safeSignerCount={roleInfo.pendingGrant.accountInfo.safeSignerCount}
              />
            </div>
            <p><span className="font-medium">Scheduled:</span> {formatTs(roleInfo.pendingGrant.scheduledAt)}</p>
            <p><span className="font-medium">Executable:</span> {formatTs(roleInfo.pendingGrant.executableAt)}</p>
          </div>
          <div className="mt-3">
            <CancelPendingGrantButton
              roleHash={roleInfo.hash}
              accessManagerAddress={accessManagerAddress}
              isConnected={isConnected}
              isWrongChain={isWrongChain}
              sentinelHasRole={sentinelHasRole}
            />
          </div>
        </div>
      )}

      <GrantSection
        roleInfo={roleInfo}
        accessManagerAddress={accessManagerAddress}
        adminSafeAddress={adminSafeAddress}
        isConnected={isConnected}
        isWrongChain={isWrongChain}
        isAdminSafeOwner={isAdminSafeOwner}
        adminHasRole={adminHasRole}
        pendingCountdown={pendingCountdown}
        pendingIsReady={pendingIsReady}
      />

      <SetTimelockSection
        roleHash={roleInfo.hash}
        currentDelay={roleInfo.timelockSeconds}
        hasPendingGrant={Boolean(roleInfo.pendingGrant)}
        accessManagerAddress={accessManagerAddress}
        adminSafeAddress={adminSafeAddress}
        isConnected={isConnected}
        isWrongChain={isWrongChain}
        isAdminSafeOwner={isAdminSafeOwner}
        adminHasRole={adminHasRole}
      />
    </div>
  )
}
