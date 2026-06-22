'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { encodeFunctionData, decodeErrorResult, getAddress, isAddress } from 'viem'
import { HA_TIME_LOCK_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { getPublicClient } from '@/lib/client'
import { V2_ENCODED_ROLE_HASHES, V2_ENCODED_ROLE_LABELS } from '@/lib/v2-role-hashes'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import type { UpgradesV2PageData, UpgradeV2Operation } from '@/lib/upgrades-v2-reader'
import { formatDecodedUpgradeLabel } from '@/lib/upgrade-v2-calldata'
import { useVaultConfig } from '@/lib/vault-context'

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

      {op.state === 'Ready' && (
        <ExecuteButtons op={op} data={data} executorSafes={executorSafes} />
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
  }
  return err.cause?.shortMessage ?? err.shortMessage ?? 'Simulation failed'
}

function ExecuteButtons({
  op,
  data,
  executorSafes,
}: {
  op: UpgradeV2Operation
  data: UpgradesV2PageData
  executorSafes: { label: string; address: string }[]
}) {
  const uid = `exec-${op.id.slice(2, 10)}`
  const { isConnected, chainId, address } = useAccount()
  const vaultConfig = useVaultConfig()
  const queryClient = useQueryClient()
  const controllerAddress = data.controllerAddress!

  const [execMode, setExecMode] = useState<ExecMode>('eoa')
  const [safeAddress, setSafeAddress] = useState(executorSafes[0]?.address ?? '')
  const [simulateError, setSimulateError] = useState<string | null>(null)

  const isWrongChain = isConnected && chainId !== 999
  const safeAddr =
    safeAddress && isAddress(safeAddress) ? (getAddress(safeAddress) as `0x${string}`) : undefined

  const { data: safeInfo } = useSafeInfo(execMode === 'safe' ? safeAddr : undefined)
  const isSafeOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const proposeTx = useProposeSafeTransaction(execMode === 'safe' ? safeAddr : undefined)
  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    isSuccess: isWriteSuccess,
    isError: isWriteError,
    error: writeError,
    reset: writeReset,
  } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  })

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

  async function simulateExecute(account: `0x${string}`): Promise<string | null> {
    try {
      const client = getPublicClient()
      await client.simulateContract({
        address: controllerAddress,
        abi: HA_TIME_LOCK_ABI,
        functionName: 'execute',
        args: executeArgs(),
        account,
      })
      return null
    } catch (e) {
      return formatSimulateError(e)
    }
  }

  async function handleExecuteEoa() {
    if (!address) return
    writeReset()
    setSimulateError(null)
    const simErr = await simulateExecute(address as `0x${string}`)
    if (simErr) {
      setSimulateError(simErr)
      return
    }
    writeContract({
      address: controllerAddress,
      abi: HA_TIME_LOCK_ABI,
      functionName: 'execute',
      args: executeArgs(),
    })
  }

  async function handleExecuteSafe() {
    if (!address) return
    setSimulateError(null)
    const simErr = await simulateExecute(address as `0x${string}`)
    if (simErr) {
      setSimulateError(simErr)
      return
    }
    proposeTx.reset()
    proposeTx.mutate({ to: controllerAddress, data: encodeExecuteData() })
  }

  useEffect(() => {
    if ((isWriteSuccess && isConfirmed) || proposeTx.isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['upgrades-v2', vaultConfig.slug] })
    }
  }, [isWriteSuccess, isConfirmed, proposeTx.isSuccess, queryClient, vaultConfig.slug])

  const canEoa = isConnected && !isWrongChain
  const canSafe = isConnected && !isWrongChain && isSafeOwner && Boolean(safeAddr)

  const isPending = execMode === 'eoa' ? isWritePending || isConfirming : proposeTx.isPending
  const isSuccess = execMode === 'eoa' ? isWriteSuccess : proposeTx.isSuccess
  const isError = execMode === 'eoa' ? isWriteError : proposeTx.isError
  const err = simulateError ?? (execMode === 'eoa' ? writeError : proposeTx.error)

  let label = execMode === 'eoa' ? 'Execute' : 'Execute via Safe'
  let disabled = false
  let cls = 'bg-blue-600 text-white hover:bg-blue-700'

  if (!isConnected) {
    label = 'Connect wallet'
    disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    label = 'Wrong network'
    disabled = true
    cls = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (execMode === 'eoa' && !canEoa) {
    label = 'Connect wallet'
    disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (execMode === 'safe' && !isSafeOwner) {
    label = 'Not Safe owner'
    disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (execMode === 'safe' && !canSafe) {
    label = 'Select Safe'
    disabled = true
    cls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isPending) {
    label = 'Confirm…'
    disabled = true
  } else if (isSuccess) {
    label = execMode === 'eoa' ? 'Executed' : 'Proposed'
    disabled = true
    cls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (isError || simulateError) {
    label = 'Retry'
    cls = 'bg-red-600 text-white hover:bg-red-700'
  }

  return (
    <div className="border-t border-neutral-200 bg-white p-5 sm:p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Execute as</p>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="radio"
            name={`${uid}-exec-mode`}
            checked={execMode === 'eoa'}
            onChange={() => {
              setExecMode('eoa')
              setSimulateError(null)
              writeReset()
              proposeTx.reset()
            }}
          />
          Connected wallet (EOA)
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="radio"
            name={`${uid}-exec-mode`}
            checked={execMode === 'safe'}
            onChange={() => {
              setExecMode('safe')
              setSimulateError(null)
              writeReset()
              proposeTx.reset()
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
      {execMode === 'safe' && executorSafes.length > 0 && (
        <div className="mt-2">
          <select
            value={safeAddress}
            onChange={(e) => {
              setSafeAddress(e.target.value)
              proposeTx.reset()
            }}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {executorSafes.map((s) => (
              <option key={s.address} value={s.address}>
                {s.label} ({truncateAddress(s.address)})
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

      {!isConnected && (
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Connect wallet to execute this upgrade.
        </p>
      )}
      {isConnected && isWrongChain && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Switch to HyperEVM (chain 999).
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {(isError || simulateError) && err && (
          <span
            className="max-w-md truncate text-xs text-red-600 dark:text-red-400 cursor-help"
            title={typeof err === 'string' ? err : err.message}
          >
            {typeof err === 'string' ? err : err.message}
          </span>
        )}
        {proposeTx.isSuccess && execMode === 'safe' && (
          <Link href="/safe-transactions" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            View pending Safe txs →
          </Link>
        )}
        <div className="ml-auto">
          <button
            onClick={execMode === 'eoa' ? handleExecuteEoa : handleExecuteSafe}
            disabled={disabled}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${cls}`}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  )
}
