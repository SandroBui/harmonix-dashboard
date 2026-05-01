'use client'

import { useState } from 'react'
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { encodeFunctionData, getAddress } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { useRoleCheck, useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { HA_TIMELOCK_CONTROLLER_ABI } from '@/lib/abis'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import type { UpgradesPageData, UpgradeOperation } from '@/lib/upgrades-reader'
import { useVaultConfig } from '@/lib/vault-context'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

type Props = {
  data: UpgradesPageData
}

function formatCountdown(executableAt: string, nowMs: number): string {
  const eta = Number(executableAt) * 1000
  if (eta <= nowMs) return 'Ready'
  const diff = Math.floor((eta - nowMs) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}m`
}

function StateBadge({ state }: { state: UpgradeOperation['state'] }) {
  const cls: Record<UpgradeOperation['state'], string> = {
    Waiting: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Ready: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls[state]}`}>{state}</span>
  )
}

export default function OperationsTab({ data }: Props) {
  if (!data.controllerAddress) {
    return (
      <p className="text-sm text-neutral-400 dark:text-neutral-500">
        No controller configured — operations will appear here once the HaTimelockController is granted UPGRADER_ROLE.
      </p>
    )
  }

  if (data.operations.length === 0) {
    return (
      <p className="text-sm text-neutral-400 dark:text-neutral-500">
        No pending upgrade operations.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {data.operations.map((op) => (
        <OperationRow key={op.id} op={op} data={data} />
      ))}
    </div>
  )
}

function OperationRow({ op, data }: { op: UpgradeOperation; data: UpgradesPageData }) {
  const [expanded, setExpanded] = useState(false)
  const nowMs = data.fetchedAt

  const targetLabel = truncateAddress(op.target)

  const methodLabel = op.decoded
    ? `upgradeToAndCall(${truncateAddress(op.decoded.newImplementation)})`
    : op.data && op.data.length >= 10
    ? op.data.slice(0, 10)
    : 'raw transfer'

  const eta = formatCountdown(op.executableAt, nowMs)

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={op.state} />
            <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
              {truncateAddress(op.id)}
            </span>
            <CopyButton value={op.id} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              Target: <span className="font-mono">{targetLabel}</span>
              <CopyButton value={op.target} />
            </span>
            <span>Method: <span className="font-mono">{methodLabel}</span></span>
            <span>
              {op.state === 'Waiting' ? `Ready in: ${eta}` : `ETA: ${eta}`}
            </span>
            {op.predecessor !== ZERO_BYTES32 && (
              <span className="text-amber-600 dark:text-amber-400">
                Predecessor: {truncateAddress(op.predecessor)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CancelButton op={op} controllerAddress={data.controllerAddress!} />
          {op.state === 'Ready' && (
            <ExecuteButton op={op} data={data} />
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {expanded ? 'Collapse' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
          <div className="space-y-3 text-xs">
            <DetailRow label="Operation ID">
              <span className="font-mono break-all">{op.id}</span>
              <CopyButton value={op.id} />
            </DetailRow>

            <DetailRow label="Target">
              <span className="font-mono">{op.target}</span>
              <CopyButton value={op.target} />
            </DetailRow>
            <DetailRow label="Value"><span className="font-mono">{op.value} wei</span></DetailRow>
            <DetailRow label="Data">
              <span className="font-mono break-all">{op.data}</span>
              <CopyButton value={op.data} />
            </DetailRow>
            {op.decoded && (
              <DetailRow label="New impl">
                <span className="font-mono">{op.decoded.newImplementation}</span>
                <CopyButton value={op.decoded.newImplementation} />
              </DetailRow>
            )}

            <DetailRow label="Proposer">
              <span className="font-mono">{op.proposer}</span>
              <CopyButton value={op.proposer} />
            </DetailRow>
            <DetailRow label="Predecessor">
              <span className="font-mono break-all">{op.predecessor}</span>
            </DetailRow>
            <DetailRow label="Salt">
              <span className="font-mono">{op.salt === ZERO_BYTES32 ? '(none)' : op.salt}</span>
            </DetailRow>
            <DetailRow label="Delay"><span className="font-mono">{op.delay}s</span></DetailRow>
            <DetailRow label="Scheduled at">
              <span className="font-mono">{op.scheduledAt}</span>
              <span className="ml-2 text-neutral-400">
                ({new Date(Number(op.scheduledAt) * 1000).toLocaleString()})
              </span>
            </DetailRow>
            <DetailRow label="Executable at">
              <span className="font-mono">{op.executableAt}</span>
              <span className="ml-2 text-neutral-400">
                ({new Date(Number(op.executableAt) * 1000).toLocaleString()})
              </span>
            </DetailRow>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <span className="min-w-[100px] font-medium text-neutral-600 dark:text-neutral-400">{label}:</span>
      <span className="flex items-center gap-1 text-neutral-900 dark:text-white">{children}</span>
    </div>
  )
}

// ─── Cancel button (SENTINEL_ROLE, direct EOA write) ──────────────────────────

function CancelButton({
  op,
  controllerAddress,
}: {
  op: UpgradeOperation
  controllerAddress: `0x${string}`
}) {
  const { isConnected, chainId } = useAccount()
  const { hasRole: sentinelHasRole } = useRoleCheck('sentinel')
  const vaultConfig = useVaultConfig()
  const queryClient = useQueryClient()

  const { writeContract, data: txHash, isPending, isSuccess, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  })

  const isWrongChain = isConnected && chainId !== 999

  function handleCancel() {
    reset()
    writeContract({
      address: controllerAddress,
      abi: HA_TIMELOCK_CONTROLLER_ABI,
      functionName: 'cancel',
      args: [op.id],
    })
  }

  if (isSuccess && !isConfirming) {
    queryClient.invalidateQueries({ queryKey: ['upgrades', 'pageData', vaultConfig.slug] })
  }

  let label: string
  let disabled = false
  let cls = 'bg-red-600 text-white hover:bg-red-700'

  if (!isConnected) {
    label = 'Connect wallet'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    label = 'Wrong network'; disabled = true
    cls = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!sentinelHasRole) {
    label = 'No SENTINEL_ROLE'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isPending || isConfirming) {
    label = 'Confirm...'; disabled = true
  } else if (isSuccess) {
    label = 'Cancelled'; disabled = true
    cls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (isError) {
    label = 'Retry'
  } else {
    label = 'Cancel'
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleCancel}
        disabled={disabled}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${cls}`}
      >
        {label}
      </button>
      {isError && error && (
        <span
          className="max-w-[160px] truncate text-xs text-red-600 dark:text-red-400 cursor-help"
          title={error.message}
        >
          {error.message}
        </span>
      )}
    </div>
  )
}

// ─── Execute button (UPGRADE_EXECUTOR_ROLE, Safe or EOA) ─────────────────────

function ExecuteButton({ op, data }: { op: UpgradeOperation; data: UpgradesPageData }) {
  const { isConnected, chainId, address } = useAccount()
  const vaultConfig = useVaultConfig()
  const queryClient = useQueryClient()

  const isSafeExecutor = data.executorType === 'Safe'
  const isEoaExecutor = data.executorType === 'EOA'
  const executorAddress = data.executorAddress

  // Safe path — pull owners directly from the on-chain executor Safe (data.executorAddress
  // is the actual UPGRADE_EXECUTOR_ROLE holder; trusting role config from app config can
  // resolve to the wrong Safe).
  const proposeTx = useProposeSafeTransaction(
    isSafeExecutor && executorAddress ? executorAddress : undefined,
  )
  const { data: executorSafeInfo } = useSafeInfo(
    isSafeExecutor && executorAddress ? executorAddress : undefined,
  )
  const isSafeOwner = Boolean(
    address && executorSafeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  // EOA path
  const { writeContract, data: txHash, isPending: isWritePending, isSuccess: isWriteSuccess, isError: isWriteError, error: writeError, reset: writeReset } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  })

  const isWrongChain = isConnected && chainId !== 999
  const isEoaMatch = isEoaExecutor && executorAddress && address
    ? address.toLowerCase() === executorAddress.toLowerCase()
    : false

  const controllerAddress = data.controllerAddress!

  function executeArgs(): readonly [`0x${string}`, bigint, `0x${string}`, `0x${string}`, `0x${string}`] {
    return [
      getAddress(op.target) as `0x${string}`,
      BigInt(op.value),
      op.data,
      op.predecessor,
      op.salt,
    ] as const
  }

  function encodeExecuteData(): `0x${string}` {
    return encodeFunctionData({
      abi: HA_TIMELOCK_CONTROLLER_ABI,
      functionName: 'execute',
      args: executeArgs(),
    })
  }

  function handleExecute() {
    if (isSafeExecutor) {
      proposeTx.reset()
      proposeTx.mutate({ to: controllerAddress, data: encodeExecuteData() })
    } else {
      writeReset()
      writeContract({
        address: controllerAddress,
        abi: HA_TIMELOCK_CONTROLLER_ABI,
        functionName: 'execute',
        args: executeArgs(),
      })
    }
  }

  if ((isWriteSuccess || proposeTx.isSuccess) && !isConfirming) {
    queryClient.invalidateQueries({ queryKey: ['upgrades', 'pageData', vaultConfig.slug] })
  }

  const isPending = isSafeExecutor ? proposeTx.isPending : (isWritePending || isConfirming)
  const isSuccess = isSafeExecutor ? proposeTx.isSuccess : isWriteSuccess
  const isError = isSafeExecutor ? proposeTx.isError : isWriteError
  const err = isSafeExecutor ? proposeTx.error : writeError

  let label: string
  let disabled = false
  let cls = 'bg-blue-600 text-white hover:bg-blue-700'

  if (!isConnected) {
    label = 'Connect wallet'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    label = 'Wrong network'; disabled = true
    cls = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!isSafeExecutor && !isEoaExecutor) {
    label = 'Unsupported executor'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isSafeExecutor && !isSafeOwner) {
    label = 'Not Safe owner'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isEoaExecutor && !isEoaMatch) {
    label = 'Not executor EOA'; disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isPending) {
    label = isSafeExecutor ? 'Confirm in wallet...' : 'Confirm...'
    disabled = true
  } else if (isSuccess) {
    label = isSafeExecutor ? 'Proposed' : 'Executed'
    disabled = true
    cls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (isError) {
    label = 'Retry'
    cls = 'bg-red-600 text-white hover:bg-red-700'
  } else {
    label = isSafeExecutor ? 'Execute via Safe' : 'Execute'
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleExecute}
        disabled={disabled}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${cls}`}
      >
        {label}
      </button>
      {isError && err && (
        <span
          className="max-w-[160px] truncate text-xs text-red-600 dark:text-red-400 cursor-help"
          title={err.message}
        >
          {err.message}
        </span>
      )}
    </div>
  )
}
