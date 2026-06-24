'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { encodeFunctionData, decodeErrorResult, getAddress, isAddress } from 'viem'
import { HA_TIME_LOCK_ABI } from '@/lib/abis'
import { PROXY_ADMIN_ABI } from '@/lib/abis/proxy-admin'
import { readProxyAdminOwner } from '@/lib/proxy-admin'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { getPublicClient } from '@/lib/client'
import { V2_ENCODED_ROLE_HASHES, V2_ENCODED_ROLE_LABELS } from '@/lib/v2-role-hashes'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import type { UpgradesV2PageData, UpgradeV2Operation } from '@/lib/upgrades-v2-reader'
import { formatDecodedUpgradeLabel } from '@/lib/upgrade-v2-calldata'
import { OZ_CANCELLER_ROLE, OZ_PROPOSER_ROLE } from '@/lib/oz-timelock-roles'
import { removeStoredUpgradeOp } from '@/lib/upgrades-v2-storage'
import { resolveV2SafeAddressFromLabel } from '@/lib/safe/v2-safes'
import { useVaultConfig } from '@/lib/vault-context'
import { safeTransactionsHref } from '@/lib/resolve-vault'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

type ExecMode = 'eoa' | 'safe'

type Props = {
  data: UpgradesV2PageData
  executorSafes: { label: string; address: string }[]
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

function StateBadge({ state }: { state: UpgradeV2Operation['state'] }) {
  const cls: Record<UpgradeV2Operation['state'], string> = {
    Waiting: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Ready: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls[state]}`}>{state}</span>
  )
}

export default function ExecuteV2Tab({ data, executorSafes }: Props) {
  if (!data.controllerAddress) {
    return (
      <p className="text-sm text-neutral-400 dark:text-neutral-500">
        No timelock controller configured — set timelockControllerAddress in vault config.
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
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Execute Upgrade</h2>
      {data.operations.map((op) => (
        <OperationRow
          key={op.id}
          op={op}
          data={data}
          executorSafes={executorSafes}
        />
      ))}
    </div>
  )
}

function OperationRow({
  op,
  data,
  executorSafes,
}: {
  op: UpgradeV2Operation
  data: UpgradesV2PageData
  executorSafes: { label: string; address: string }[]
}) {
  const [expanded, setExpanded] = useState(false)
  const nowMs = data.fetchedAt

  const targetLabel = truncateAddress(op.target)
  const methodLabel = op.decoded
    ? formatDecodedUpgradeLabel(op.decoded)
    : op.data && op.data.length >= 10
      ? op.data.slice(0, 10)
      : 'raw transfer'
  const proxyLabel =
    op.decoded && 'proxy' in op.decoded
      ? truncateAddress(op.decoded.proxy)
      : truncateAddress(op.target)
  const eta = formatCountdown(op.executableAt, nowMs)

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900/30">
      <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
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
              Timelock target: <span className="font-mono">{targetLabel}</span>
              <CopyButton value={op.target} />
            </span>
            {op.decoded && op.decoded.method !== 'upgradeToAndCall' && (
              <span>
                Proxy: <span className="font-mono">{proxyLabel}</span>
                <CopyButton value={op.decoded.proxy} />
              </span>
            )}
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

        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          {expanded ? 'Collapse' : 'Details'}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-neutral-200 bg-white p-5 sm:p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="space-y-3 text-sm">
            <DetailRow label="Operation ID">
              <span className="font-mono break-all">{op.id}</span>
              <CopyButton value={op.id} />
            </DetailRow>
            <DetailRow label="Timelock target">
              <span className="font-mono">{op.target}</span>
              <CopyButton value={op.target} />
            </DetailRow>
            {op.decoded && (
              <>
                {op.decoded.method === 'upgradeToAndCall' ? (
                  <DetailRow label="Proxy">
                    <span className="font-mono">{op.decoded.proxy}</span>
                    <CopyButton value={op.decoded.proxy} />
                  </DetailRow>
                ) : (
                  <>
                    <DetailRow label="ProxyAdmin">
                      <span className="font-mono">{op.decoded.proxyAdmin}</span>
                      <CopyButton value={op.decoded.proxyAdmin} />
                    </DetailRow>
                    <DetailRow label="Proxy">
                      <span className="font-mono">{op.decoded.proxy}</span>
                      <CopyButton value={op.decoded.proxy} />
                    </DetailRow>
                  </>
                )}
                <DetailRow label="New impl">
                  <span className="font-mono">{op.decoded.newImplementation}</span>
                  <CopyButton value={op.decoded.newImplementation} />
                </DetailRow>
                {'initData' in op.decoded && op.decoded.initData !== '0x' && (
                  <DetailRow label="Init data">
                    <span className="font-mono break-all">{op.decoded.initData}</span>
                    <CopyButton value={op.decoded.initData} />
                  </DetailRow>
                )}
              </>
            )}
            {!op.decoded && (
              <>
                <DetailRow label="Value"><span className="font-mono">{op.value} wei</span></DetailRow>
                <DetailRow label="Data">
                  <span className="font-mono break-all">{op.data}</span>
                  <CopyButton value={op.data} />
                </DetailRow>
              </>
            )}
            {op.decoded && (
              <DetailRow label="Value"><span className="font-mono">{op.value} wei</span></DetailRow>
            )}
            {op.decoded && (
              <DetailRow label="Calldata">
                <span className="font-mono break-all">{op.data}</span>
                <CopyButton value={op.data} />
              </DetailRow>
            )}
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

      <OperationActions op={op} data={data} executorSafes={executorSafes} />
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

const ACCESS_CONTROL_ERRORS = [
  {
    type: 'error' as const,
    name: 'AccessControlUnauthorizedAccount',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'neededRole', type: 'bytes32' },
    ],
  },
]

const UPGRADE_INNER_ERRORS = [
  { type: 'error' as const, name: 'FailedInnerCall', inputs: [] },
  {
    type: 'error' as const,
    name: 'ERC1967InvalidImplementation',
    inputs: [{ name: 'implementation', type: 'address' }],
  },
] as const

const FAILED_INNER_CALL_SELECTOR = '0x1425ea42'

function isFailedInnerCallError(e: unknown): boolean {
  const err = e as { shortMessage?: string; cause?: { shortMessage?: string; data?: string } }
  const text = [err.shortMessage, err.cause?.shortMessage].filter(Boolean).join(' ')
  if (text.includes(FAILED_INNER_CALL_SELECTOR) || text.includes('FailedInnerCall')) return true
  const raw = err.cause?.data
  if (raw?.startsWith(FAILED_INNER_CALL_SELECTOR)) return true
  return false
}

async function diagnoseInnerUpgradeRevert(
  op: UpgradeV2Operation,
  timelockAddress: `0x${string}`,
): Promise<string | null> {
  const decoded = op.decoded
  if (decoded && 'proxyAdmin' in decoded) {
    try {
      const owner = await readProxyAdminOwner(decoded.proxyAdmin)
      if (owner.toLowerCase() !== timelockAddress.toLowerCase()) {
        return `ProxyAdmin ${truncateAddress(decoded.proxyAdmin)} is owned by ${truncateAddress(owner)}, not the timelock. Timelock execute cannot authorize ProxyAdmin.upgrade — cancel this operation and upgrade via Schedule (Safe Direct) for Balance Contract, or transfer ProxyAdmin ownership to the timelock in Admin → Roles.`
      }
    } catch {
      // continue with inner simulation
    }
  }

  if (!decoded || decoded.method === 'upgradeToAndCall') {
    return 'Timelock execute reverted inside the scheduled call (FailedInnerCall). Cancel this operation and re-schedule, or verify the target calldata on-chain.'
  }

  const client = getPublicClient()
  const implLabel = truncateAddress(decoded.newImplementation)

  try {
    if (decoded.method === 'upgrade') {
      await client.simulateContract({
        address: decoded.proxyAdmin,
        abi: PROXY_ADMIN_ABI,
        functionName: 'upgradeAndCall',
        args: [decoded.proxy, decoded.newImplementation, '0x'],
        account: timelockAddress,
      })
    } else if (decoded.method === 'upgradeAndCall') {
      await client.simulateContract({
        address: decoded.proxyAdmin,
        abi: PROXY_ADMIN_ABI,
        functionName: 'upgradeAndCall',
        args: [decoded.proxy, decoded.newImplementation, decoded.initData],
        account: timelockAddress,
        value: BigInt(op.value),
      })
    }
    return 'Timelock execute reverted (FailedInnerCall) but the inner upgrade simulation passed — retry or inspect the operation salt/predecessor.'
  } catch (inner) {
    const innerErr = inner as { cause?: { data?: `0x${string}` }; shortMessage?: string }
    const raw = innerErr.cause?.data
    if (raw) {
      try {
        const decodedErr = decodeErrorResult({ abi: UPGRADE_INNER_ERRORS, data: raw })
        if (decodedErr.errorName === 'ERC1967InvalidImplementation') {
          const impl = decodedErr.args[0] as `0x${string}`
          return `ProxyAdmin upgrade rejected implementation ${truncateAddress(impl)} (ERC1967InvalidImplementation). Cancel this operation and re-schedule with a valid implementation contract.`
        }
      } catch {
        // fall through
      }
    }
    const proxyLabel =
      'proxy' in decoded ? truncateAddress(decoded.proxy) : truncateAddress(op.target)
    if (decoded.method === 'upgrade') {
      return `This operation calls ProxyAdmin.upgrade() but transparent proxies (Perp NAV, Balance) require ProxyAdmin.upgradeAndCall() even when init data is 0x. Cancel this operation and re-schedule — the dashboard now schedules upgradeAndCall automatically.`
    }
    return `ProxyAdmin.${decoded.method} reverted for proxy ${proxyLabel} → impl ${implLabel}. The scheduled implementation is likely invalid or incompatible. Use Cancel via Safe (PROPOSER/CANCELLER role) and re-schedule with the correct implementation.`
  }
}

function formatSimulateError(e: unknown): string {
  const err = e as {
    shortMessage?: string
    cause?: { shortMessage?: string; data?: `0x${string}` }
  }
  const raw = err.cause?.data
  if (raw) {
    try {
      const decoded = decodeErrorResult({ abi: ACCESS_CONTROL_ERRORS, data: raw })
      if (decoded.errorName === 'AccessControlUnauthorizedAccount') {
        const account = decoded.args[0] as `0x${string}`
        const neededRole = decoded.args[1] as `0x${string}`
        const roleEntry = Object.entries(V2_ENCODED_ROLE_HASHES).find(
          ([, hash]) => hash === neededRole,
        )
        const roleLabel = roleEntry
          ? V2_ENCODED_ROLE_LABELS[roleEntry[0] as keyof typeof V2_ENCODED_ROLE_LABELS]
          : neededRole
        return `Fund contract rejected upgrade: ${truncateAddress(account)} lacks ${roleLabel} role on the fund contract. Grant this role to the timelock before executing.`
      }
    } catch {
      // fall through
    }
    try {
      const decoded = decodeErrorResult({ abi: UPGRADE_INNER_ERRORS, data: raw })
      if (decoded.errorName === 'FailedInnerCall') {
        return 'Timelock execute reverted: inner call failed (FailedInnerCall).'
      }
    } catch {
      // fall through
    }
  }
  const fallback = err.cause?.shortMessage ?? err.shortMessage ?? 'Simulation failed'
  if (fallback.includes(FAILED_INNER_CALL_SELECTOR)) {
    return 'Timelock execute reverted: inner call failed (FailedInnerCall).'
  }
  return fallback
}

function formatTimelockCancelRoles(
  hasProposer: boolean | undefined,
  hasCanceller: boolean | undefined,
): string {
  if (hasProposer === undefined && hasCanceller === undefined) return ''
  if (hasProposer || hasCanceller) {
    const roles = [
      hasProposer && 'PROPOSER_ROLE',
      hasCanceller && 'CANCELLER_ROLE',
    ].filter(Boolean)
    return ` · ${roles.join(' / ')}: yes`
  }
  return ' · lacks PROPOSER_ROLE / CANCELLER_ROLE on timelock'
}

function OperationActions({
  op,
  data,
  executorSafes,
}: {
  op: UpgradeV2Operation
  data: UpgradesV2PageData
  executorSafes: { label: string; address: string }[]
}) {
  const uid = `act-${op.id.slice(2, 10)}`
  const { isConnected, chainId, address } = useAccount()
  const vaultConfig = useVaultConfig()
  const queryClient = useQueryClient()
  const controllerAddress = data.controllerAddress!

  const [execMode, setExecMode] = useState<ExecMode>('safe')
  const [safeLabel, setSafeLabel] = useState(executorSafes[0]?.label ?? '')
  const [simulateError, setSimulateError] = useState<string | null>(null)

  const isWrongChain = isConnected && chainId !== 999
  const safeAddr = useMemo(() => {
    const addr = resolveV2SafeAddressFromLabel(executorSafes, safeLabel)
    return addr && isAddress(addr) ? (getAddress(addr) as `0x${string}`) : undefined
  }, [executorSafes, safeLabel])

  const { data: safeInfo } = useSafeInfo(execMode === 'safe' ? safeAddr : undefined)
  const isSafeOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const { data: eoaHasCanceller } = useReadContract({
    address: controllerAddress,
    abi: HA_TIME_LOCK_ABI,
    functionName: 'hasRole',
    args: address ? [OZ_CANCELLER_ROLE, address] : undefined,
    query: { enabled: execMode === 'eoa' && Boolean(address) },
  })

  const { data: eoaHasProposer } = useReadContract({
    address: controllerAddress,
    abi: HA_TIME_LOCK_ABI,
    functionName: 'hasRole',
    args: address ? [OZ_PROPOSER_ROLE, address] : undefined,
    query: { enabled: execMode === 'eoa' && Boolean(address) },
  })

  const { data: safeHasCanceller } = useReadContract({
    address: controllerAddress,
    abi: HA_TIME_LOCK_ABI,
    functionName: 'hasRole',
    args: safeAddr ? [OZ_CANCELLER_ROLE, safeAddr] : undefined,
    query: { enabled: execMode === 'safe' && Boolean(safeAddr) },
  })

  const { data: safeHasProposer } = useReadContract({
    address: controllerAddress,
    abi: HA_TIME_LOCK_ABI,
    functionName: 'hasRole',
    args: safeAddr ? [OZ_PROPOSER_ROLE, safeAddr] : undefined,
    query: { enabled: execMode === 'safe' && Boolean(safeAddr) },
  })

  const cancelProposeTx = useProposeSafeTransaction(execMode === 'safe' ? safeAddr : undefined)
  const executeProposeTx = useProposeSafeTransaction(execMode === 'safe' ? safeAddr : undefined)

  const {
    writeContract: writeCancel,
    data: cancelTxHash,
    isPending: isCancelWritePending,
    isSuccess: isCancelWriteSuccess,
    isError: isCancelWriteError,
    error: cancelWriteError,
    reset: cancelWriteReset,
  } = useWriteContract()
  const { isLoading: isCancelConfirming, isSuccess: isCancelConfirmed } =
    useWaitForTransactionReceipt({
      hash: cancelTxHash,
      query: { enabled: Boolean(cancelTxHash) },
    })

  const {
    writeContract: writeExecute,
    data: executeTxHash,
    isPending: isExecuteWritePending,
    isSuccess: isExecuteWriteSuccess,
    isError: isExecuteWriteError,
    error: executeWriteError,
    reset: executeWriteReset,
  } = useWriteContract()
  const { isLoading: isExecuteConfirming, isSuccess: isExecuteConfirmed } =
    useWaitForTransactionReceipt({
      hash: executeTxHash,
      query: { enabled: Boolean(executeTxHash) },
    })

  function resetMutations() {
    setSimulateError(null)
    cancelWriteReset()
    executeWriteReset()
    cancelProposeTx.reset()
    executeProposeTx.reset()
  }

  function encodeCancelData(): `0x${string}` {
    return encodeFunctionData({
      abi: HA_TIME_LOCK_ABI,
      functionName: 'cancel',
      args: [op.id],
    })
  }

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
      abi: HA_TIME_LOCK_ABI,
      functionName: 'execute',
      args: executeArgs(),
    })
  }

  async function simulateExecute(caller: `0x${string}`): Promise<string | null> {
    try {
      const client = getPublicClient()
      await client.simulateContract({
        address: controllerAddress,
        abi: HA_TIME_LOCK_ABI,
        functionName: 'execute',
        args: executeArgs(),
        account: caller,
      })
      return null
    } catch (e) {
      if (isFailedInnerCallError(e)) {
        return (await diagnoseInnerUpgradeRevert(op, controllerAddress)) ?? formatSimulateError(e)
      }
      return formatSimulateError(e)
    }
  }

  function handleCancelEoa() {
    if (!address) return
    cancelWriteReset()
    writeCancel({
      address: controllerAddress,
      abi: HA_TIME_LOCK_ABI,
      functionName: 'cancel',
      args: [op.id],
    })
  }

  function handleCancelSafe() {
    cancelProposeTx.reset()
    cancelProposeTx.mutate({ to: controllerAddress, data: encodeCancelData() })
  }

  async function handleExecuteEoa() {
    if (!address) return
    executeWriteReset()
    setSimulateError(null)
    const simErr = await simulateExecute(address as `0x${string}`)
    if (simErr) {
      setSimulateError(simErr)
      return
    }
    writeExecute({
      address: controllerAddress,
      abi: HA_TIME_LOCK_ABI,
      functionName: 'execute',
      args: executeArgs(),
    })
  }

  async function handleExecuteSafe() {
    if (!safeAddr) return
    setSimulateError(null)
    const simErr = await simulateExecute(safeAddr)
    if (simErr) {
      setSimulateError(simErr)
      return
    }
    executeProposeTx.reset()
    executeProposeTx.mutate({ to: controllerAddress, data: encodeExecuteData() })
  }

  useEffect(() => {
    if ((isCancelWriteSuccess && isCancelConfirmed) || cancelProposeTx.isSuccess) {
      removeStoredUpgradeOp(vaultConfig.slug, op.id)
      queryClient.invalidateQueries({ queryKey: ['upgrades-v2', vaultConfig.slug] })
    }
  }, [
    isCancelWriteSuccess,
    isCancelConfirmed,
    cancelProposeTx.isSuccess,
    queryClient,
    vaultConfig.slug,
    op.id,
  ])

  useEffect(() => {
    if ((isExecuteWriteSuccess && isExecuteConfirmed) || executeProposeTx.isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['upgrades-v2', vaultConfig.slug] })
    }
  }, [
    isExecuteWriteSuccess,
    isExecuteConfirmed,
    executeProposeTx.isSuccess,
    queryClient,
    vaultConfig.slug,
  ])

  const hasCancelRole =
    execMode === 'eoa'
      ? eoaHasCanceller === true || eoaHasProposer === true
      : safeHasCanceller === true || safeHasProposer === true

  const isCancelPending =
    execMode === 'eoa' ? isCancelWritePending || isCancelConfirming : cancelProposeTx.isPending
  const isCancelSuccess = execMode === 'eoa' ? isCancelWriteSuccess : cancelProposeTx.isSuccess
  const isCancelError = execMode === 'eoa' ? isCancelWriteError : cancelProposeTx.isError
  const cancelErr = execMode === 'eoa' ? cancelWriteError : cancelProposeTx.error

  const isExecutePending =
    execMode === 'eoa' ? isExecuteWritePending || isExecuteConfirming : executeProposeTx.isPending
  const isExecuteSuccess = execMode === 'eoa' ? isExecuteWriteSuccess : executeProposeTx.isSuccess
  const isExecuteError = execMode === 'eoa' ? isExecuteWriteError : executeProposeTx.isError
  const executeErr = simulateError ?? (execMode === 'eoa' ? executeWriteError : executeProposeTx.error)

  const canEoa = isConnected && !isWrongChain
  const canSafe = isConnected && !isWrongChain && isSafeOwner && Boolean(safeAddr)
  const isReady = op.state === 'Ready'

  let cancelLabel = execMode === 'eoa' ? 'Cancel upgrade' : 'Cancel via Safe'
  let cancelDisabled = false
  let cancelCls =
    'border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-red-900/20'

  if (!isConnected) {
    cancelLabel = 'Connect wallet'
    cancelDisabled = true
    cancelCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500 border-transparent'
  } else if (isWrongChain) {
    cancelLabel = 'Wrong network'
    cancelDisabled = true
    cancelCls = 'bg-amber-100 text-amber-600 cursor-not-allowed border-transparent'
  } else if (execMode === 'safe' && !isSafeOwner) {
    cancelLabel = 'Not Safe owner'
    cancelDisabled = true
    cancelCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500 border-transparent'
  } else if (execMode === 'safe' && !safeAddr) {
    cancelLabel = 'Select Safe'
    cancelDisabled = true
    cancelCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500 border-transparent'
  } else if (!hasCancelRole) {
    cancelLabel = 'No cancel role'
    cancelDisabled = true
    cancelCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500 border-transparent'
  } else if (isCancelPending) {
    cancelLabel = 'Confirm…'
    cancelDisabled = true
    cancelCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500 border-transparent'
  } else if (isCancelSuccess) {
    cancelLabel = execMode === 'eoa' ? 'Cancelled' : 'Proposed'
    cancelDisabled = true
    cancelCls = 'bg-green-600 text-white cursor-not-allowed border-transparent'
  } else if (isCancelError) {
    cancelLabel = 'Retry cancel'
    cancelCls = 'bg-red-600 text-white hover:bg-red-700 border-transparent'
  }

  let executeLabel = execMode === 'eoa' ? 'Execute' : 'Execute via Safe'
  let executeDisabled = false
  let executeCls = 'bg-blue-600 text-white hover:bg-blue-700'

  if (!isReady) {
    executeLabel = 'Waiting for delay'
    executeDisabled = true
    executeCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!isConnected) {
    executeLabel = 'Connect wallet'
    executeDisabled = true
    executeCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    executeLabel = 'Wrong network'
    executeDisabled = true
    executeCls = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (execMode === 'eoa' && !canEoa) {
    executeLabel = 'Connect wallet'
    executeDisabled = true
    executeCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (execMode === 'safe' && !isSafeOwner) {
    executeLabel = 'Not Safe owner'
    executeDisabled = true
    executeCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (execMode === 'safe' && !canSafe) {
    executeLabel = 'Select Safe'
    executeDisabled = true
    executeCls =
      'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isExecutePending) {
    executeLabel = 'Confirm…'
    executeDisabled = true
  } else if (isExecuteSuccess) {
    executeLabel = execMode === 'eoa' ? 'Executed' : 'Proposed'
    executeDisabled = true
    executeCls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (isExecuteError || simulateError) {
    executeLabel = 'Retry execute'
    executeCls = 'bg-red-600 text-white hover:bg-red-700'
  }

  const showSafeProposedLink =
    execMode === 'safe' && (cancelProposeTx.isSuccess || executeProposeTx.isSuccess)

  return (
    <div className="border-t border-neutral-200 bg-white p-5 sm:p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Execute as</p>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="radio"
            name={`${uid}-mode`}
            value="eoa"
            checked={execMode === 'eoa'}
            onChange={() => {
              setExecMode('eoa')
              resetMutations()
            }}
          />
          Connected wallet (EOA)
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="radio"
            name={`${uid}-mode`}
            value="safe"
            checked={execMode === 'safe'}
            onChange={() => {
              setExecMode('safe')
              resetMutations()
            }}
          />
          Safe (propose)
        </label>
      </div>

      {execMode === 'eoa' && address && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Caller: {truncateAddress(address)}
          {formatTimelockCancelRoles(eoaHasProposer, eoaHasCanceller)}
        </p>
      )}

      {execMode === 'safe' && executorSafes.length > 0 && (
        <div className="mt-2">
          <select
            value={safeLabel}
            onChange={(e) => {
              setSafeLabel(e.target.value)
              resetMutations()
            }}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {executorSafes.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label} ({truncateAddress(s.address)})
              </option>
            ))}
          </select>
          {safeAddr && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {isSafeOwner ? 'You are a Safe owner' : 'You are not an owner of this Safe'}
              {formatTimelockCancelRoles(safeHasProposer, safeHasCanceller)}
            </p>
          )}
        </div>
      )}

      {!isConnected && (
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Connect wallet to cancel or execute this upgrade.
        </p>
      )}
      {isConnected && isWrongChain && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Switch to HyperEVM (chain 999).
        </p>
      )}

      {(isCancelError && cancelErr) || (isExecuteError && executeErr) ? (
        <div className="mt-4 space-y-1">
          {isCancelError && cancelErr && (
            <p
              className="text-xs text-red-600 dark:text-red-400"
              title={cancelErr.message}
            >
              Cancel: {cancelErr.message}
            </p>
          )}
          {(isExecuteError || simulateError) && executeErr && (
            <p
              className="text-xs text-red-600 dark:text-red-400"
              title={typeof executeErr === 'string' ? executeErr : executeErr.message}
            >
              Execute: {typeof executeErr === 'string' ? executeErr : executeErr.message}
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {showSafeProposedLink && (
          <Link
            href={safeTransactionsHref(vaultConfig.slug)}
            className="mr-auto text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            View pending Safe txs →
          </Link>
        )}
        <button
          type="button"
          onClick={execMode === 'eoa' ? handleCancelEoa : handleCancelSafe}
          disabled={cancelDisabled}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${cancelCls}`}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={execMode === 'eoa' ? handleExecuteEoa : handleExecuteSafe}
          disabled={executeDisabled}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${executeCls}`}
        >
          {executeLabel}
        </button>
      </div>
    </div>
  )
}
