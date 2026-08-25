'use client'

import { useState, useId, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  encodeFunctionData,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  isHex,
} from 'viem'
import { HA_TIME_LOCK_ABI, OWNABLE_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import { OZ_PROPOSER_ROLE } from '@/lib/oz-timelock-roles'
import { readProxyAdminOwner } from '@/lib/proxy-admin'
import { saveStoredUpgradeOp } from '@/lib/upgrades-v2-storage'
import type { UpgradesV2PageData } from '@/lib/upgrades-v2-reader'
import {
  buildUpgradeScheduleArgsFromInputs,
  resolveProxyUpgradeMode,
  resolveUpgradeDelivery,
  type UpgradeMode,
} from '@/lib/upgrade-v2-calldata'
import { resolveV2SafeAddressFromLabel } from '@/lib/safe/v2-safes'
import { useVaultConfig } from '@/lib/vault-context'
import { safeTransactionsHref } from '@/lib/resolve-vault'

function randomBytes32(): `0x${string}` {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return `0x${Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

function computeOperationId(
  target: `0x${string}`,
  value: bigint,
  data: `0x${string}`,
  predecessor: `0x${string}`,
  salt: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [target, value, data, predecessor, salt],
    ),
  )
}

type ExecMode = 'eoa' | 'safe'

type Props = {
  data: UpgradesV2PageData
  proposerSafes: { label: string; address: string }[]
}

export default function ScheduleV2Tab({ data, proposerSafes }: Props) {
  const uid = useId()
  const vaultConfig = useVaultConfig()
  const queryClient = useQueryClient()

  const { isConnected, chainId, address } = useAccount()
  const isWrongChain = isConnected && chainId !== 999

  const controllerAddress = data.controllerAddress
  const minDelaySeconds = data.minDelay

  const [execMode, setExecMode] = useState<ExecMode>('safe')
  const [safeLabel, setSafeLabel] = useState(proposerSafes[0]?.label ?? '')

  const [delay, setDelay] = useState(minDelaySeconds)
  useEffect(() => {
    const min = BigInt(minDelaySeconds || '0')
    if (min <= 0n) return
    setDelay((current) => {
      try {
        if (BigInt(current || '0') < min) return minDelaySeconds
      } catch {
        return minDelaySeconds
      }
      return current
    })
  }, [minDelaySeconds])
  const [salt, setSalt] = useState<string>(() => randomBytes32())
  const [predecessor, setPredecessor] = useState(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
  )

  const [proxySelection, setProxySelection] = useState<string>('')
  const proxyAddr = proxySelection
  const [implAddr, setImplAddr] = useState('')
  const [initData, setInitData] = useState('0x')

  const knownEntry = data.knownContracts.find(
    (c) => c.address.toLowerCase() === proxyAddr.toLowerCase(),
  )

  const proxyAddressResolved =
    proxyAddr && isAddress(proxyAddr) ? (getAddress(proxyAddr) as `0x${string}`) : undefined

  const { data: liveProxyMeta, isFetching: liveProxyMetaLoading } = useQuery({
    queryKey: ['upgrade-v2-proxy-meta', vaultConfig.slug, proxyAddressResolved],
    queryFn: async () => {
      const { upgradeMode, proxyAdminAddress } = await resolveProxyUpgradeMode(
        proxyAddressResolved!,
        vaultConfig,
      )
      const proxyAdminOwner = proxyAdminAddress
        ? await readProxyAdminOwner(proxyAdminAddress)
        : undefined
      return { upgradeMode, proxyAdminAddress, proxyAdminOwner }
    },
    enabled: Boolean(proxyAddressResolved),
    staleTime: 30_000,
  })

  const upgradeMode: UpgradeMode | null =
    liveProxyMeta?.upgradeMode ?? knownEntry?.upgradeMode ?? null
  const proxyAdminAddress = liveProxyMeta?.proxyAdminAddress ?? knownEntry?.proxyAdminAddress
  const cachedProxyAdminOwner = knownEntry?.proxyAdminOwner

  const proxyAdminResolved =
    proxyAdminAddress && isAddress(proxyAdminAddress)
      ? (getAddress(proxyAdminAddress) as `0x${string}`)
      : undefined

  const { data: liveProxyAdminOwner } = useReadContract({
    address: proxyAdminResolved,
    abi: OWNABLE_ABI,
    functionName: 'owner',
    query: { enabled: Boolean(proxyAdminResolved) },
  })

  const proxyAdminOwner = useMemo(() => {
    if (liveProxyAdminOwner) return getAddress(liveProxyAdminOwner) as `0x${string}`
    if (liveProxyMeta?.proxyAdminOwner) return liveProxyMeta.proxyAdminOwner
    if (cachedProxyAdminOwner && isAddress(cachedProxyAdminOwner)) {
      return getAddress(cachedProxyAdminOwner) as `0x${string}`
    }
    return undefined
  }, [liveProxyAdminOwner, liveProxyMeta?.proxyAdminOwner, cachedProxyAdminOwner])

  const upgradeDelivery =
    upgradeMode !== null
      ? resolveUpgradeDelivery(
          { upgradeMode, proxyAdminOwner },
          controllerAddress ?? null,
        )
      : 'timelock'
  const isSafeDirect = upgradeDelivery === 'safe-direct'

  const ownerSafeAddr = proxyAdminOwner

  useEffect(() => {
    if (!isSafeDirect || !ownerSafeAddr) return
    const match = proposerSafes.find(
      (s) => s.address.toLowerCase() === ownerSafeAddr.toLowerCase(),
    )
    if (match) setSafeLabel(match.label)
    setExecMode('safe')
  }, [isSafeDirect, ownerSafeAddr, proposerSafes])

  const safeAddr = useMemo(() => {
    if (isSafeDirect && ownerSafeAddr) return ownerSafeAddr
    const addr = resolveV2SafeAddressFromLabel(proposerSafes, safeLabel)
    return addr && isAddress(addr) ? (getAddress(addr) as `0x${string}`) : undefined
  }, [isSafeDirect, ownerSafeAddr, proposerSafes, safeLabel])
  const effectiveSafeAddr = isSafeDirect ? ownerSafeAddr : safeAddr
  const { data: safeInfo } = useSafeInfo(execMode === 'safe' || isSafeDirect ? effectiveSafeAddr : undefined)
  const isSafeOwner = Boolean(
    address && safeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const { data: eoaHasProposer } = useReadContract({
    address: controllerAddress ?? undefined,
    abi: HA_TIME_LOCK_ABI,
    functionName: 'hasRole',
    args: address && controllerAddress ? [OZ_PROPOSER_ROLE, address] : undefined,
    query: { enabled: !isSafeDirect && execMode === 'eoa' && Boolean(controllerAddress && address) },
  })

  const { data: safeHasProposer } = useReadContract({
    address: controllerAddress ?? undefined,
    abi: HA_TIME_LOCK_ABI,
    functionName: 'hasRole',
    args: safeAddr && controllerAddress ? [OZ_PROPOSER_ROLE, safeAddr] : undefined,
    query: { enabled: !isSafeDirect && execMode === 'safe' && Boolean(controllerAddress && safeAddr) },
  })

  const proposeTx = useProposeSafeTransaction(
    execMode === 'safe' || isSafeDirect ? effectiveSafeAddr : undefined,
  )
  const {
    writeContract,
    data: eoaTxHash,
    isPending: eoaIsPending,
    isSuccess: eoaIsSuccess,
    isError: eoaIsError,
    error: eoaError,
    reset: resetEoa,
  } = useWriteContract()
  const { isLoading: eoaIsConfirming, isSuccess: eoaConfirmed } = useWaitForTransactionReceipt({
    hash: eoaTxHash,
    query: { enabled: Boolean(eoaTxHash) },
  })

  function buildCallArgs(): {
    target: `0x${string}`
    value: bigint
    innerData: `0x${string}`
  } | null {
    if (!upgradeMode) return null
    if (initData && !isHex(initData)) return null
    const args = buildUpgradeScheduleArgsFromInputs(
      proxyAddr,
      implAddr,
      initData,
      upgradeMode,
      proxyAdminAddress,
    )
    if (!args) return null
    return { target: args.target, value: args.value, innerData: args.innerData }
  }

  function buildSalt(): `0x${string}` | null {
    try {
      if (!isHex(salt) || salt.length !== 66) return null
      return salt as `0x${string}`
    } catch {
      return null
    }
  }

  function buildPredecessor(): `0x${string}` | null {
    try {
      if (!isHex(predecessor) || predecessor.length !== 66) return null
      return predecessor as `0x${string}`
    } catch {
      return null
    }
  }

  const callArgs = buildCallArgs()
  const saltHex = buildSalt()
  const predecessorHex = buildPredecessor()
  const delayBigInt = (() => {
    try {
      return BigInt(delay || '0')
    } catch {
      return null
    }
  })()
  const delayValid = delayBigInt !== null && delayBigInt >= BigInt(minDelaySeconds)

  const operationId =
    callArgs && saltHex && predecessorHex && delayBigInt !== null
      ? computeOperationId(callArgs.target, callArgs.value, callArgs.innerData, predecessorHex, saltHex)
      : null

  const formValid = Boolean(callArgs && saltHex && predecessorHex && delayValid && operationId)
  const directFormValid = Boolean(callArgs && isAddress(implAddr))

  const canExecuteEoa = isConnected && !isWrongChain && eoaHasProposer === true
  const canExecuteSafe = isConnected && !isWrongChain && isSafeOwner && safeHasProposer === true
  const canExecuteDirectSafe =
    isConnected && !isWrongChain && isSafeOwner && Boolean(ownerSafeAddr) && effectiveSafeAddr === ownerSafeAddr
  const canExecute = isSafeDirect
    ? canExecuteDirectSafe
    : execMode === 'eoa'
      ? canExecuteEoa
      : canExecuteSafe

  function persistScheduledOp() {
    if (!operationId || !callArgs || !saltHex || !predecessorHex || delayBigInt === null) return
    saveStoredUpgradeOp(vaultConfig.slug, {
      id: operationId,
      target: callArgs.target,
      value: callArgs.value.toString(),
      data: callArgs.innerData,
      predecessor: predecessorHex,
      salt: saltHex,
      delay: delayBigInt.toString(),
      savedAt: Date.now(),
    })
    queryClient.invalidateQueries({ queryKey: ['upgrades-v2', vaultConfig.slug] })
  }

  function encodeScheduleCalldata(): `0x${string}` {
    if (!callArgs || !saltHex || !predecessorHex || delayBigInt === null) return '0x'
    return encodeFunctionData({
      abi: HA_TIME_LOCK_ABI,
      functionName: 'schedule',
      args: [
        callArgs.target,
        callArgs.value,
        callArgs.innerData,
        predecessorHex,
        saltHex,
        delayBigInt,
      ],
    })
  }

  function handleScheduleEoa() {
    if (!controllerAddress || !formValid || !canExecuteEoa) return
    resetEoa()
    writeContract({
      address: controllerAddress,
      abi: HA_TIME_LOCK_ABI,
      functionName: 'schedule',
      args: [
        callArgs!.target,
        callArgs!.value,
        callArgs!.innerData,
        predecessorHex!,
        saltHex!,
        delayBigInt!,
      ],
    })
  }

  function handleScheduleSafe() {
    if (!controllerAddress || !formValid || !canExecuteSafe) return
    proposeTx.reset()
    proposeTx.mutate({ to: controllerAddress, data: encodeScheduleCalldata() })
  }

  function handleDirectSafeUpgrade() {
    if (!callArgs || !canExecuteDirectSafe) return
    proposeTx.reset()
    proposeTx.mutate({
      to: callArgs.target,
      data: callArgs.innerData,
      value: callArgs.value.toString(),
    })
  }

  useEffect(() => {
    if (eoaConfirmed || (proposeTx.isSuccess && !isSafeDirect)) {
      persistScheduledOp()
    }
  }, [eoaConfirmed, proposeTx.isSuccess, isSafeDirect])

  const eoaBusy = eoaIsPending || eoaIsConfirming
  const busy = execMode === 'eoa' ? eoaBusy : proposeTx.isPending
  const success = execMode === 'eoa' ? eoaIsSuccess : proposeTx.isSuccess
  const errored = execMode === 'eoa' ? eoaIsError : proposeTx.isError
  const activeError = execMode === 'eoa' ? eoaError?.message : proposeTx.error?.message

  let btnLabel = isSafeDirect
    ? 'Propose upgrade via Safe'
    : execMode === 'eoa'
      ? 'Schedule'
      : 'Propose schedule'
  let btnDisabled = false
  let btnCls = 'bg-blue-600 text-white hover:bg-blue-700'

  if (!controllerAddress && !isSafeDirect) {
    btnLabel = 'Controller not configured'
    btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!isConnected) {
    btnLabel = 'Connect wallet'
    btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'
    btnDisabled = true
    btnCls = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!(isSafeDirect ? directFormValid : formValid)) {
    btnLabel = 'Fill required fields'
    btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!canExecute) {
    btnLabel = isSafeDirect
      ? 'Not owner of ProxyAdmin Safe'
      : execMode === 'eoa'
        ? 'Wallet lacks PROPOSER_ROLE'
        : 'Safe lacks PROPOSER_ROLE'
    btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!isSafeDirect && execMode === 'safe' && !isSafeOwner) {
    btnLabel = 'Not Safe owner'
    btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (busy) {
    btnLabel = 'Confirm in wallet…'
    btnDisabled = true
  } else if (success) {
    btnLabel = isSafeDirect ? 'Proposed' : execMode === 'eoa' ? 'Scheduled' : 'Proposed'
    btnDisabled = true
    btnCls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (errored) {
    btnLabel = 'Failed — Retry'
    btnCls = 'bg-red-600 text-white hover:bg-red-700'
  }

  function resetTx() {
    resetEoa()
    proposeTx.reset()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Schedule Upgrade</h2>

      <div className="space-y-5">
        <FormField id={`${uid}-proxy`} label="Target proxy">
          <select
            id={`${uid}-proxy`}
            value={proxySelection}
            onChange={(e) => { setProxySelection(e.target.value); resetTx() }}
            className={inputCls}
          >
            <option value="">Select a contract…</option>
            {data.knownContracts.map((c) => (
              <option key={c.address} value={c.address}>
                {c.name} [{c.upgradeMode === 'uups' ? 'UUPS' : 'Transparent'}] — {truncateAddress(c.address)}
              </option>
            ))}
          </select>
          {proxyAddr && isAddress(proxyAddr) && (
            <p className="mt-1 flex items-center gap-1 font-mono text-xs text-neutral-500 dark:text-neutral-400">
              <span className="break-all">{proxyAddr}</span>
              <CopyButton value={proxyAddr} />
            </p>
          )}
          {proxyAddr && isAddress(proxyAddr) && upgradeMode && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Upgrade mode:{' '}
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {upgradeMode === 'uups' ? 'UUPS' : 'Transparent'}
              </span>
              {liveProxyMetaLoading && !proxyAdminAddress && (
                <> · Loading ProxyAdmin…</>
              )}
              {upgradeMode === 'transparent' && proxyAdminAddress && (
                <>
                  {' '}
                  · ProxyAdmin: {truncateAddress(proxyAdminAddress)}
                  <CopyButton value={proxyAdminAddress} />
                </>
              )}
              {upgradeMode === 'transparent' && proxyAdminOwner && (
                <>
                  {' '}
                  · Owner: {truncateAddress(proxyAdminOwner)}
                  <CopyButton value={proxyAdminOwner} />
                </>
              )}
            </p>
          )}
          {isSafeDirect && ownerSafeAddr && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              This transparent proxy uses a <strong>Safe-owned ProxyAdmin</strong> — upgrades go
              directly through that Safe, not the timelock. Scheduling via timelock would fail at
              execute time.
            </div>
          )}
          {upgradeMode === 'transparent' && !isSafeDirect && controllerAddress && proxyAdminOwner && (
            <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
              ProxyAdmin is owned by the timelock — schedule here, then execute after the delay on
              the Execute Upgrade tab.
            </div>
          )}
          {proxyAddr && !isAddress(proxyAddr) && <Hint error>Invalid address</Hint>}
        </FormField>

        {callArgs && upgradeMode && (
          <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            {isSafeDirect ? (
              <>
                Safe calls ProxyAdmin ({truncateAddress(callArgs.target)}) →{' '}
                <code className="font-mono">upgradeAndCall</code>{' '}
                on proxy {truncateAddress(proxyAddr)}
                {initData !== '0x' && initData.length > 2 && ' (with init data)'}
              </>
            ) : upgradeMode === 'uups' ? (
              <>
                Timelock target = proxy ({truncateAddress(proxyAddr)}), calls{' '}
                <code className="font-mono">upgradeToAndCall</code>
              </>
            ) : (
              <>
                Timelock target = ProxyAdmin ({truncateAddress(callArgs.target)}), calls{' '}
                <code className="font-mono">upgradeAndCall</code>{' '}
                on proxy {truncateAddress(proxyAddr)}
                {initData !== '0x' && initData.length > 2 && ' (with init data)'}
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <FormField id={`${uid}-impl`} label="New implementation address">
            <input
              id={`${uid}-impl`}
              type="text"
              placeholder="0x…"
              value={implAddr}
              onChange={(e) => { setImplAddr(e.target.value); resetTx() }}
              className={inputCls}
            />
            {implAddr && !isAddress(implAddr) && <Hint error>Invalid address</Hint>}
          </FormField>

          <FormField id={`${uid}-init`} label="Init data (leave 0x if none)">
            <input
              id={`${uid}-init`}
              type="text"
              placeholder="0x"
              value={initData}
              onChange={(e) => { setInitData(e.target.value); resetTx() }}
              className={inputCls}
            />
            {initData && !isHex(initData) && <Hint error>Must be 0x-prefixed hex</Hint>}
          </FormField>
        </div>

        {!isSafeDirect && (
        <>
        <div className="border-t border-neutral-100 pt-5 dark:border-neutral-800">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <FormField id={`${uid}-delay`} label={`Delay (seconds) — min: ${minDelaySeconds}s`}>
              <input
                id={`${uid}-delay`}
                type="text"
                value={delay}
                onChange={(e) => { setDelay(e.target.value); resetTx() }}
                className={inputCls}
              />
              {delay && delayBigInt !== null && !delayValid && BigInt(minDelaySeconds || '0') > 0n && (
                <Hint error>Delay must be ≥ {minDelaySeconds}s (current min delay)</Hint>
              )}
            </FormField>

            <FormField id={`${uid}-predecessor`} label="Predecessor (bytes32, 0x00…00 = none)">
              <input
                id={`${uid}-predecessor`}
                type="text"
                value={predecessor}
                onChange={(e) => { setPredecessor(e.target.value); resetTx() }}
                className={inputCls}
              />
              {predecessor && !predecessorHex && (
                <Hint error>Must be a 66-char 0x-prefixed hex (bytes32)</Hint>
              )}
            </FormField>
          </div>

          <FormField id={`${uid}-salt`} label="Salt (bytes32)" className="mt-5">
            <div className="flex w-full gap-2">
              <input
                id={`${uid}-salt`}
                type="text"
                value={salt}
                onChange={(e) => { setSalt(e.target.value); resetTx() }}
                className={`${inputCls} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => setSalt(randomBytes32())}
                className="shrink-0 rounded-md border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Randomize
              </button>
            </div>
            {salt && !saltHex && <Hint error>Must be a 66-char 0x-prefixed hex (bytes32)</Hint>}
          </FormField>
        </div>

        {operationId && (
          <div className="rounded-md border border-neutral-100 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Computed operation ID</p>
            <p className="mt-0.5 break-all font-mono text-xs text-neutral-900 dark:text-white">
              {operationId}
            </p>
          </div>
        )}
        </>
        )}
      </div>

      <div className="border-t border-neutral-100 pt-6 dark:border-neutral-800">
        <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
          {isSafeDirect ? 'Propose as' : 'Execute as'}
        </p>
        <div className="flex flex-wrap gap-4">
          {!isSafeDirect && (
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="radio"
              name={`${uid}-exec-mode`}
              value="eoa"
              checked={execMode === 'eoa'}
              onChange={() => {
                setExecMode('eoa')
                resetTx()
              }}
            />
            Connected wallet (EOA)
          </label>
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="radio"
              name={`${uid}-exec-mode`}
              value="safe"
              checked={execMode === 'safe' || isSafeDirect}
              onChange={() => {
                setExecMode('safe')
                resetTx()
              }}
            />
            Safe (propose)
          </label>
        </div>
        {!isSafeDirect && execMode === 'eoa' && address && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Caller: {truncateAddress(address)}
            {eoaHasProposer === false && ' — wallet does not hold PROPOSER_ROLE'}
            {eoaHasProposer === true && ' — wallet holds PROPOSER_ROLE'}
          </p>
        )}
        {(execMode === 'safe' || isSafeDirect) && (isSafeDirect ? ownerSafeAddr : proposerSafes.length > 0) && (
          <div className="mt-2">
            {isSafeDirect && ownerSafeAddr ? (
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                ProxyAdmin owner Safe: {truncateAddress(ownerSafeAddr)}
                <CopyButton value={ownerSafeAddr} />
              </p>
            ) : (
            <select
              value={safeLabel}
              onChange={(e) => {
                setSafeLabel(e.target.value)
                resetTx()
              }}
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              {proposerSafes.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label} ({truncateAddress(s.address)})
                </option>
              ))}
            </select>
            )}
            {effectiveSafeAddr && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {isSafeOwner ? 'You are a Safe owner' : 'You are not an owner of this Safe'}
                {!isSafeDirect && safeHasProposer === false && ' — Safe lacks PROPOSER_ROLE'}
                {!isSafeDirect && safeHasProposer === true && ' — Safe holds PROPOSER_ROLE'}
                {isSafeDirect && isSafeOwner && ' — can propose ProxyAdmin.upgrade'}
              </p>
            )}
          </div>
        )}
      </div>

      {!isConnected && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Connect wallet to schedule an upgrade.
        </p>
      )}
      {isConnected && isWrongChain && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Switch to HyperEVM (chain 999).</p>
      )}
      {formValid && !canExecute && isConnected && !isWrongChain && !isSafeDirect && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {execMode === 'eoa'
            ? 'Connected wallet does not hold PROPOSER_ROLE — switch to Safe (propose) or connect a proposer wallet.'
            : 'You are not an owner of the selected Safe, or the Safe lacks PROPOSER_ROLE.'}
        </p>
      )}
      {isSafeDirect && directFormValid && !canExecute && isConnected && !isWrongChain && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Connect as an owner of the ProxyAdmin Safe ({ownerSafeAddr ? truncateAddress(ownerSafeAddr) : '…'}).
        </p>
      )}

      <div className="flex flex-wrap items-start gap-3">
        {activeError && (
          <span
            className="max-w-md truncate text-xs text-red-600 dark:text-red-400 cursor-help"
            title={activeError}
          >
            {activeError}
          </span>
        )}

        {proposeTx.isSuccess && (execMode === 'safe' || isSafeDirect) && (
          <Link href={safeTransactionsHref(vaultConfig.slug)} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            View pending Safe txs →
          </Link>
        )}

        <div className="ml-auto">
          <button
            onClick={
              isSafeDirect
                ? handleDirectSafeUpgrade
                : execMode === 'eoa'
                  ? handleScheduleEoa
                  : handleScheduleSafe
            }
            disabled={btnDisabled}
            className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${btnCls}`}
          >
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white'

function FormField({
  id,
  label,
  children,
  className,
}: {
  id: string
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <label htmlFor={id} className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </label>
      {children}
    </div>
  )
}

function Hint({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p
      className={`text-xs ${error ? 'text-red-600 dark:text-red-400' : 'text-neutral-400 dark:text-neutral-500'}`}
    >
      {children}
    </p>
  )
}
