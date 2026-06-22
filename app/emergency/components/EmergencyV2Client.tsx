'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { encodeFunctionData, getAddress, isAddress, type Abi } from 'viem'
import { FUND_CONTRACT_ABI } from '@/lib/abis'
import CopyButton from '@/app/components/CopyButton'
import { getPublicClient } from '@/lib/client'
import type {
  EmergencyV2ContractEntry,
  EmergencyV2ContractKey,
  EmergencyV2PageData,
  EmergencyV2PauseStatusData,
} from '@/lib/emergency-v2-reader'
import { truncateAddress } from '@/lib/format'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { useVaultConfig } from '@/lib/vault-context'
import { V2_ENCODED_ROLE_HASHES } from '@/lib/v2-role-hashes'

const AUTO_REFRESH_MS = 30_000

type Props = { data: EmergencyV2PageData }
type ExecMode = 'eoa' | 'safe'

const CONTRACT_ABIS: Record<EmergencyV2ContractKey, Abi> = {
  fund: FUND_CONTRACT_ABI,
}

function truncate(addr: string) {
  return truncateAddress(addr)
}

function formatTxError(e: unknown): string {
  const err = e as { shortMessage?: string; cause?: { shortMessage?: string } }
  return err.cause?.shortMessage ?? err.shortMessage ?? 'Simulation failed'
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

type ButtonState = { label: string; disabled: boolean; className: string }

function buildPauseButtonState(
  shouldPause: boolean,
  mode: ExecMode,
  opts: {
    isConnected: boolean
    isWrongChain: boolean
    canExecute: boolean
    contractConfigured: boolean
    busy: boolean
    success: boolean
    errored: boolean
  },
): ButtonState {
  const action = shouldPause ? 'Pause' : 'Unpause'
  const idleLabel = mode === 'eoa' ? action : `Propose ${action.toLowerCase()}`
  const red = 'bg-red-600 text-white hover:bg-red-700'
  const green = 'bg-green-600 text-white hover:bg-green-700'
  const disabled =
    'bg-neutral-200 text-neutral-500 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-400'
  const idleClass = shouldPause ? red : green

  if (!opts.isConnected || opts.isWrongChain || !opts.canExecute || !opts.contractConfigured) {
    return { label: idleLabel, disabled: true, className: disabled }
  }
  if (opts.busy) {
    return { label: 'Working…', disabled: true, className: idleClass }
  }
  if (opts.success) {
    return {
      label: mode === 'eoa' ? `✓ ${action}d` : `✓ ${action} proposed`,
      disabled: true,
      className: 'bg-green-600 text-white cursor-not-allowed',
    }
  }
  if (opts.errored) {
    return { label: `${idleLabel} — Retry`, disabled: false, className: idleClass }
  }
  return { label: idleLabel, disabled: false, className: idleClass }
}

function PauseStatusBadge({
  contract,
  loading,
}: {
  contract: EmergencyV2ContractEntry
  loading?: boolean
}) {
  if (loading || contract.isPaused === null) {
    return (
      <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        {loading ? 'Loading…' : 'Unknown'}
      </span>
    )
  }
  if (contract.isPaused) {
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
        Paused
      </span>
    )
  }
  return (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
      Active
    </span>
  )
}

type ContractPauseState = Pick<EmergencyV2ContractEntry, 'isPaused' | 'lastTxHash' | 'lastTimestamp'>

function buildInitialPauseStates(contracts: EmergencyV2ContractEntry[]): Record<EmergencyV2ContractKey, ContractPauseState> {
  return Object.fromEntries(
    contracts.map((c) => [
      c.key,
      { isPaused: c.isPaused, lastTxHash: c.lastTxHash, lastTimestamp: c.lastTimestamp },
    ]),
  ) as Record<EmergencyV2ContractKey, ContractPauseState>
}

export default function EmergencyV2Client({ data }: Props) {
  const vaultConfig = useVaultConfig()
  const { address, isConnected, chainId } = useAccount()
  const isWrongChain = isConnected && chainId !== 999

  const configuredContracts = data.contracts.filter((c) => c.configured)
  const defaultContractKey = configuredContracts[0]?.key ?? 'fund'

  const [contractKey, setContractKey] = useState<EmergencyV2ContractKey>(defaultContractKey)
  const [execMode, setExecMode] = useState<ExecMode>('eoa')
  const [safeAddress, setSafeAddress] = useState(data.safes[0]?.address ?? '')
  const [pauseActionOverride, setPauseActionOverride] = useState<boolean | null>(null)
  const [pauseStates, setPauseStates] = useState<Record<EmergencyV2ContractKey, ContractPauseState>>(() =>
    buildInitialPauseStates(data.contracts),
  )
  const [pauseStatusLoading, setPauseStatusLoading] = useState(true)
  const [pauseStatusRefreshing, setPauseStatusRefreshing] = useState(false)
  const [pauseScanError, setPauseScanError] = useState<string | null>(null)
  const [simError, setSimError] = useState<string | null>(null)
  const [revertError, setRevertError] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  const lastExecutedPauseRef = useRef<boolean | null>(null)
  const optimisticPauseRef = useRef<{
    key: EmergencyV2ContractKey
    isPaused: boolean
    txHash: string | null
  } | null>(null)

  const selectedContract = data.contracts.find((c) => c.key === contractKey)
  const displayContract = selectedContract
    ? { ...selectedContract, ...pauseStates[selectedContract.key] }
    : undefined
  const contractAddress = selectedContract?.configured
    ? (getAddress(selectedContract.address) as `0x${string}`)
    : undefined
  const contractAbi = CONTRACT_ABIS[contractKey]

  const serverSuggestedPauseAction = displayContract?.isPaused === true ? false : true
  const pauseAction = pauseActionOverride ?? serverSuggestedPauseAction
  const shouldPause = pauseAction

  const applyOptimisticPause = useCallback((key: EmergencyV2ContractKey, isPaused: boolean, txHash?: string) => {
    optimisticPauseRef.current = {
      key,
      isPaused,
      txHash: txHash?.toLowerCase() ?? null,
    }
    setPauseStates((prev) => ({
      ...prev,
      [key]: {
        isPaused,
        lastTxHash: txHash?.toLowerCase() ?? prev[key]?.lastTxHash ?? null,
        lastTimestamp: txHash ? Math.floor(Date.now() / 1000) : prev[key]?.lastTimestamp ?? null,
      },
    }))
    setPauseActionOverride(null)
  }, [])

  const fetchPauseStatus = useCallback(
    async (opts: { bypassCache?: boolean; background?: boolean; force?: boolean } = {}) => {
      const { bypassCache = false, background = false, force = false } = opts
      if (background) {
        setPauseStatusRefreshing(true)
      } else {
        setPauseStatusLoading(true)
      }

      try {
        const params = new URLSearchParams({ vault: vaultConfig.slug })
        if (bypassCache) params.set('bypassCache', '1')

        const res = await fetch(`/api/emergency/v2/pause-status?${params.toString()}`, {
          cache: 'no-store',
        })
        const json = (await res.json()) as EmergencyV2PauseStatusData & { error?: string }

        if (!res.ok) {
          throw new Error(json.error ?? `Pause status request failed (${res.status})`)
        }

        const lock = optimisticPauseRef.current
        setPauseStates((prev) => {
          const next = { ...prev }
          for (const entry of json.contracts) {
            if (!force && lock?.key === entry.key) {
              const scanCaughtUp =
                entry.lastTxHash &&
                lock.txHash &&
                entry.lastTxHash.toLowerCase() === lock.txHash.toLowerCase()
              if (scanCaughtUp) {
                optimisticPauseRef.current = null
              } else {
                continue
              }
            }
            next[entry.key] = {
              isPaused: entry.isPaused,
              lastTxHash: entry.lastTxHash,
              lastTimestamp: entry.lastTimestamp,
            }
          }
          return next
        })
        setPauseScanError(json.scanError)
      } catch (err) {
        setPauseScanError(err instanceof Error ? err.message : 'Failed to load pause status')
      } finally {
        setPauseStatusLoading(false)
        setPauseStatusRefreshing(false)
      }
    },
    [vaultConfig.slug],
  )

  useEffect(() => {
    void fetchPauseStatus()
  }, [fetchPauseStatus])

  useEffect(() => {
    const interval = setInterval(() => {
      if (optimisticPauseRef.current) return
      void fetchPauseStatus({ background: true })
    }, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchPauseStatus])

  const safeAddr =
    safeAddress && isAddress(safeAddress) ? (getAddress(safeAddress) as `0x${string}`) : undefined
  const { data: safeInfo } = useSafeInfo(execMode === 'safe' ? safeAddr : undefined)
  const isSafeOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const { data: eoaCanAdmin } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'hasRole',
    args: address && contractAddress ? [V2_ENCODED_ROLE_HASHES.ADMIN, address] : undefined,
    query: { enabled: execMode === 'eoa' && Boolean(contractAddress && address) },
  })

  const { data: safeCanAdmin } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'hasRole',
    args: safeAddr && contractAddress ? [V2_ENCODED_ROLE_HASHES.ADMIN, safeAddr] : undefined,
    query: { enabled: execMode === 'safe' && Boolean(contractAddress && safeAddr) },
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

  const {
    isLoading: eoaIsConfirming,
    isSuccess: eoaSucceeded,
    isError: eoaReverted,
  } = useWaitForTransactionReceipt({
    hash: eoaTxHash,
    query: { enabled: Boolean(eoaTxHash) },
  })

  useEffect(() => {
    if (eoaSucceeded && lastExecutedPauseRef.current !== null) {
      applyOptimisticPause(contractKey, lastExecutedPauseRef.current, eoaTxHash ?? undefined)
      lastExecutedPauseRef.current = null
      resetEoa()
    }
  }, [eoaSucceeded, eoaTxHash, contractKey, applyOptimisticPause, resetEoa])

  const canExecuteEoa = isConnected && !isWrongChain && eoaCanAdmin === true
  const canExecuteSafe =
    isConnected && !isWrongChain && isSafeOwner && Boolean(safeAddr) && safeCanAdmin === true
  const canExecute = execMode === 'eoa' ? canExecuteEoa : canExecuteSafe

  const eoaSuccess = eoaSucceeded
  const eoaErrored = Boolean(simError || revertError || eoaIsError || eoaReverted)

  function resetTxState() {
    resetEoa()
    setSimError(null)
    setRevertError(null)
    setSimulating(false)
    proposeTx.reset()
  }

  async function handleEoaAction() {
    if (!canExecute || !contractAddress || !address) return
    resetEoa()
    setSimError(null)
    setRevertError(null)
    setSimulating(true)
    try {
      const client = getPublicClient()
      await client.simulateContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'setPaused',
        args: [shouldPause],
        account: address as `0x${string}`,
      })
    } catch (e) {
      setSimError(formatTxError(e))
      setSimulating(false)
      return
    }
    setSimulating(false)
    lastExecutedPauseRef.current = shouldPause
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'setPaused',
      args: [shouldPause],
    })
  }

  function handleSafeAction() {
    if (!canExecute || !contractAddress) return
    const action = shouldPause
    proposeTx.reset()
    const calldata = encodeFunctionData({
      abi: contractAbi,
      functionName: 'setPaused',
      args: [action],
    })
    proposeTx.mutate(
      { to: contractAddress, data: calldata },
    )
  }

  const btn = buildPauseButtonState(shouldPause, execMode, {
    isConnected,
    isWrongChain,
    canExecute,
    contractConfigured: Boolean(selectedContract?.configured),
    busy:
      simulating ||
      eoaIsPending ||
      eoaIsConfirming ||
      (execMode === 'safe' && proposeTx.isPending),
    success: execMode === 'eoa' ? eoaSuccess : proposeTx.isSuccess,
    errored: execMode === 'eoa' ? eoaErrored : proposeTx.isError,
  })

  const txError =
    simError ??
    revertError ??
    (execMode === 'eoa' && eoaError ? eoaError.message : null) ??
    (execMode === 'safe' ? proposeTx.error?.message : null)

  const roleHint = useMemo(() => {
    if (!isConnected) return null
    if (execMode === 'eoa') {
      if (eoaCanAdmin === true) return 'Your wallet holds ADMIN on this contract.'
      if (eoaCanAdmin === false) return 'Your wallet does not hold ADMIN on this contract.'
      return 'Checking ADMIN role…'
    }
    if (!safeAddr) return null
    const parts: string[] = []
    parts.push(isSafeOwner ? 'You are a Safe owner.' : 'You are not an owner of this Safe.')
    if (safeCanAdmin === true) parts.push('Safe holds ADMIN on this contract.')
    else if (safeCanAdmin === false) parts.push('Safe does not hold ADMIN on this contract.')
    return parts.join(' ')
  }, [isConnected, execMode, eoaCanAdmin, safeAddr, isSafeOwner, safeCanAdmin])

  function handleRefresh() {
    optimisticPauseRef.current = null
    void fetchPauseStatus({ bypassCache: true, force: true })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Pause or unpause v2 contracts via{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">setPaused(bool)</code>. Caller must hold{' '}
          <span className="font-medium">ADMIN</span> on the selected contract. Pause state is inferred from the most
          recent successful <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">setPaused</code> transaction
          on HyperEVMScan.
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={pauseStatusLoading || pauseStatusRefreshing}
          className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          {pauseStatusLoading || pauseStatusRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {pauseScanError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {pauseScanError}
        </div>
      )}

      <div className="rounded-lg border border-red-200 bg-white p-4 dark:border-red-900/50 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-red-700 dark:text-red-400">Pause / Unpause Contract</h2>

        <div className="mb-4">
          <label htmlFor="emergency-v2-contract" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
            Contract
          </label>
          <select
            id="emergency-v2-contract"
            value={contractKey}
            onChange={(e) => {
              setContractKey(e.target.value as EmergencyV2ContractKey)
              setPauseActionOverride(null)
              resetTxState()
            }}
            className="w-full max-w-md rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {data.contracts.map((c) => (
              <option key={c.key} value={c.key} disabled={!c.configured}>
                {c.label}
                {!c.configured ? ' (not configured)' : ''}
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

        {displayContract && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <PauseStatusBadge
              contract={displayContract}
              loading={pauseStatusLoading && displayContract.isPaused === null}
            />
            {displayContract.lastTxHash && displayContract.lastTimestamp && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Inferred from tx{' '}
                <a
                  href={`https://hyperevmscan.io/tx/${displayContract.lastTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline hover:no-underline"
                >
                  {truncate(displayContract.lastTxHash)}
                </a>
                {' · '}
                {formatTimestamp(displayContract.lastTimestamp)}
              </span>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Action
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="pauseAction"
                checked={pauseAction}
                onChange={() => {
                  setPauseActionOverride(true)
                  resetTxState()
                }}
                className="accent-red-600"
              />
              Pause
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="pauseAction"
                checked={!pauseAction}
                onChange={() => {
                  setPauseActionOverride(false)
                  resetTxState()
                }}
                className="accent-green-600"
              />
              Unpause
            </label>
          </div>
        </div>

        {selectedContract && (
          <div className="mb-4 rounded-md bg-neutral-50 p-3 dark:bg-neutral-800">
            <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">Preview</p>
            <p className="text-xs text-neutral-700 dark:text-neutral-300">
              <span className="font-medium">setPaused(</span>
              <span className="font-mono">{pauseAction ? 'true' : 'false'}</span>
              <span className="font-medium">)</span>
              {' → '}
              <span className="font-mono text-neutral-500">{truncate(selectedContract.address)}</span>
            </p>
          </div>
        )}

        <div className="mb-4">
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Execute as</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="emergency-exec-mode"
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
                name="emergency-exec-mode"
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
            </div>
          )}
          {roleHint && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{roleHint}</p>
          )}
        </div>

        {!isConnected && (
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">Connect wallet to pause or unpause.</p>
        )}
        {isWrongChain && (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">Switch to HyperEVM (chain 999).</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={btn.disabled}
            onClick={() => {
              if (execMode === 'eoa') void handleEoaAction()
              else handleSafeAction()
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed ${btn.className}`}
          >
            {btn.label}
          </button>
          {proposeTx.isSuccess && execMode === 'safe' && (
            <Link
              href="/safe-transactions"
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              View pending Safe txs →
            </Link>
          )}
        </div>

        {txError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{txError}</p>
        )}
      </div>
    </div>
  )
}
