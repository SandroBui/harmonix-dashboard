'use client'

import { useState, useId } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import {
  encodeFunctionData,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  isHex,
} from 'viem'
import { useRoleCheck, useProposeSafeTransaction } from '@/lib/safe/hooks'
import { HA_TIMELOCK_CONTROLLER_ABI } from '@/lib/abis'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import type { UpgradesPageData } from '@/lib/upgrades-reader'

// Minimal ABI for UUPS proxy upgradeToAndCall
const UUPS_ABI = [
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      { name: 'newImplementation', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const

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

type Props = {
  data: UpgradesPageData
}

export default function ScheduleTab({ data }: Props) {
  const uid = useId()

  const { isConnected, chainId } = useAccount()
  const { safeAddress, hasRole, isSafeOwner } = useRoleCheck('timelock_proposer')
  const proposeTx = useProposeSafeTransaction(safeAddress)

  const controllerAddress = data.controllerAddress
  const minDelaySeconds = data.minDelay

  // ── Shared fields ──────────────────────────────────────────────────────────
  const [delay, setDelay] = useState(minDelaySeconds)
  const [salt, setSalt] = useState<string>(() => randomBytes32())
  const [predecessor, setPredecessor] = useState('0x0000000000000000000000000000000000000000000000000000000000000000')

  // ── UUPS fields ────────────────────────────────────────────────────────────
  // proxySelection: '' = no choice yet, '__custom__' = custom address, else the address itself
  const [proxySelection, setProxySelection] = useState<string>('')
  const [proxyCustomAddr, setProxyCustomAddr] = useState('')
  const proxyAddr = proxySelection === '__custom__' ? proxyCustomAddr : proxySelection
  const [implAddr, setImplAddr] = useState('')
  const [initData, setInitData] = useState('0x')

  const isWrongChain = isConnected && chainId !== 999

  // ── Derived values ─────────────────────────────────────────────────────────

  function buildCallArgs(): {
    target: `0x${string}`
    value: bigint
    innerData: `0x${string}`
  } | null {
    try {
      if (!isAddress(proxyAddr) || !isAddress(implAddr)) return null
      const iData = isHex(initData) ? (initData as `0x${string}`) : '0x'
      const innerData = encodeFunctionData({
        abi: UUPS_ABI,
        functionName: 'upgradeToAndCall',
        args: [getAddress(implAddr), iData],
      })
      return { target: getAddress(proxyAddr) as `0x${string}`, value: 0n, innerData }
    } catch {
      return null
    }
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
    try { return BigInt(delay || '0') } catch { return null }
  })()
  const delayValid = delayBigInt !== null && delayBigInt >= BigInt(minDelaySeconds)

  const operationId = callArgs && saltHex && predecessorHex && delayBigInt !== null
    ? computeOperationId(callArgs.target, callArgs.value, callArgs.innerData, predecessorHex, saltHex)
    : null

  function handlePropose() {
    if (!controllerAddress || !callArgs || !saltHex || !predecessorHex || delayBigInt === null) return
    proposeTx.reset()
    const scheduleCalldata = encodeFunctionData({
      abi: HA_TIMELOCK_CONTROLLER_ABI,
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
    proposeTx.mutate({ to: controllerAddress, data: scheduleCalldata })
  }

  // ── Button state ───────────────────────────────────────────────────────────
  let btnLabel: string
  let btnDisabled = false
  let btnCls = 'bg-blue-600 text-white hover:bg-blue-700'

  if (!controllerAddress) {
    btnLabel = 'Controller not configured'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true
    btnCls = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!isSafeOwner) {
    btnLabel = 'Not Safe owner'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!hasRole) {
    btnLabel = 'Safe lacks PROPOSER_ROLE'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm in wallet...'; btnDisabled = true
  } else if (proposeTx.isSuccess) {
    btnLabel = 'Proposed'; btnDisabled = true
    btnCls = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    btnLabel = 'Failed — Retry'
    btnCls = 'bg-red-600 text-white hover:bg-red-700'
  } else if (!callArgs || !saltHex || !predecessorHex || !delayValid) {
    btnLabel = 'Fill required fields'; btnDisabled = true
    btnCls = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else {
    btnLabel = 'Propose via Safe'
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="space-y-4">
          {/* ── UUPS upgrade fields ── */}
          <FormField id={`${uid}-proxy`} label="Target proxy (UUPS)">
            <select
              id={`${uid}-proxy`}
              value={proxySelection}
              onChange={(e) => { setProxySelection(e.target.value); proposeTx.reset() }}
              className={inputCls}
            >
              <option value="">Select a contract…</option>
              {data.knownContracts.map((c) => (
                <option key={c.address} value={c.address}>
                  {c.name} — {truncateAddress(c.address)}
                </option>
              ))}
              <option value="__custom__">Custom address…</option>
            </select>
            {proxySelection === '__custom__' && (
              <input
                type="text"
                placeholder="0x…"
                value={proxyCustomAddr}
                onChange={(e) => { setProxyCustomAddr(e.target.value); proposeTx.reset() }}
                className={`${inputCls} mt-2`}
              />
            )}
            {proxyAddr && isAddress(proxyAddr) && (
              <p className="mt-1 flex items-center gap-1 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                <span className="break-all">{proxyAddr}</span>
                <CopyButton value={proxyAddr} />
              </p>
            )}
            {proxyAddr && !isAddress(proxyAddr) && (
              <Hint error>Invalid address</Hint>
            )}
          </FormField>

          <FormField id={`${uid}-impl`} label="New implementation address">
            <input
              id={`${uid}-impl`}
              type="text"
              placeholder="0x…"
              value={implAddr}
              onChange={(e) => { setImplAddr(e.target.value); proposeTx.reset() }}
              className={inputCls}
            />
            {implAddr && !isAddress(implAddr) && (
              <Hint error>Invalid address</Hint>
            )}
          </FormField>

          <FormField id={`${uid}-init`} label="Init data (leave 0x if none)">
            <input
              id={`${uid}-init`}
              type="text"
              placeholder="0x"
              value={initData}
              onChange={(e) => { setInitData(e.target.value); proposeTx.reset() }}
              className={inputCls}
            />
            {initData && !isHex(initData) && <Hint error>Must be 0x-prefixed hex</Hint>}
          </FormField>

          {/* ── Shared fields ── */}
          <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <FormField id={`${uid}-delay`} label={`Delay (seconds) — min: ${minDelaySeconds}s`}>
              <input
                id={`${uid}-delay`}
                type="text"
                value={delay}
                onChange={(e) => { setDelay(e.target.value); proposeTx.reset() }}
                className={inputCls}
              />
              {delay && delayBigInt !== null && !delayValid && (
                <Hint error>Delay must be ≥ {minDelaySeconds}s (current min delay)</Hint>
              )}
            </FormField>

            <FormField id={`${uid}-salt`} label="Salt (bytes32)">
              <div className="flex gap-2">
                <input
                  id={`${uid}-salt`}
                  type="text"
                  value={salt}
                  onChange={(e) => { setSalt(e.target.value); proposeTx.reset() }}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => setSalt(randomBytes32())}
                  className="shrink-0 rounded-md border border-neutral-200 px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Randomize
                </button>
              </div>
              {salt && !saltHex && <Hint error>Must be a 66-char 0x-prefixed hex (bytes32)</Hint>}
            </FormField>

            <FormField id={`${uid}-predecessor`} label="Predecessor (bytes32, 0x00…00 = none)">
              <input
                id={`${uid}-predecessor`}
                type="text"
                value={predecessor}
                onChange={(e) => { setPredecessor(e.target.value); proposeTx.reset() }}
                className={inputCls}
              />
              {predecessor && !predecessorHex && <Hint error>Must be a 66-char 0x-prefixed hex (bytes32)</Hint>}
            </FormField>
          </div>

          {/* ── ID preview ── */}
          {operationId && (
            <div className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/50">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Computed operation ID
              </p>
              <p className="mt-0.5 break-all font-mono text-xs text-neutral-900 dark:text-white">
                {operationId}
              </p>
            </div>
          )}

          {/* ── Proposer info ── */}
          {safeAddress && safeAddress !== '0x' && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Proposing to Safe: <span className="font-mono">{truncateAddress(safeAddress)}</span> (TIMELOCK_PROPOSER_ROLE)
            </p>
          )}

          {/* ── Submit ── */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePropose}
              disabled={btnDisabled}
              className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${btnCls}`}
            >
              {btnLabel}
            </button>

            {proposeTx.isSuccess && (
              <Link href="/safe-transactions" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                View pending Safe txs
              </Link>
            )}

            {proposeTx.error && (
              <span
                className="max-w-sm truncate text-xs text-red-600 dark:text-red-400 cursor-help"
                title={proposeTx.error.message}
              >
                {proposeTx.error.message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white'

function FormField({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </label>
      {children}
    </div>
  )
}

function Hint({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p className={`text-xs ${error ? 'text-red-600 dark:text-red-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
      {children}
    </p>
  )
}
