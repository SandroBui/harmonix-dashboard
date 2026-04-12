'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress, parseUnits } from 'viem'
import { HA_BASE_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useRoleCheck } from '@/lib/safe/hooks'
import { TIMELOCKED_FUNCTIONS } from '@/lib/timelocks-reader'
import type { TimelockPageData } from '@/lib/timelocks-reader'

type Props = {
  data: TimelockPageData
}

export default function SubmitTab({ data }: Props) {
  const { isConnected, chainId } = useAccount()
  const { safeAddress, isSafeOwner, hasRole } = useRoleCheck('timelock_proposer')
  const proposeTx = useProposeSafeTransaction(safeAddress)

  const [selectedFn, setSelectedFn] = useState<string>('')
  const [addressArg, setAddressArg] = useState('')
  const [uint256Arg, setUint256Arg] = useState('')
  const [bytes4Arg, setBytes4Arg] = useState('')

  const isWrongChain = isConnected && chainId !== 999

  const fnDef = TIMELOCKED_FUNCTIONS.find((f) => f.name === selectedFn)

  const contractAddress = fnDef
    ? fnDef.contract === 'fundVault'
      ? getAddress(data.fundVaultAddress)
      : getAddress(data.vaultManagerAdminAddress)
    : undefined

  const timelockEntry = data.timelocks.find((t) => t.fnName === selectedFn)
  const durationSeconds = timelockEntry ? Number(timelockEntry.duration) : 0

  function encodeInnerCalldata(): `0x${string}` | null {
    if (!fnDef) return null
    try {
      if (fnDef.args === 'address') {
        if (!addressArg) return null
        const addr = getAddress(addressArg)
        return encodeFunctionData({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          abi: fnDef.abi as any,
          functionName: fnDef.name,
          args: [addr],
        })
      } else if (fnDef.args === 'address_uint256') {
        if (!addressArg) return null
        const addr = getAddress(addressArg)
        const amt = parseUnits(uint256Arg || '0', 18)
        return encodeFunctionData({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          abi: fnDef.abi as any,
          functionName: fnDef.name,
          args: [addr, amt],
        })
      } else if (fnDef.args === 'uint256') {
        if (!uint256Arg) return null
        const val = BigInt(uint256Arg)
        return encodeFunctionData({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          abi: fnDef.abi as any,
          functionName: fnDef.name,
          args: [val],
        })
      } else if (fnDef.args === 'address_bytes4') {
        if (!addressArg || !bytes4Arg) return null
        const addr = getAddress(addressArg)
        const sel = bytes4Arg as `0x${string}`
        return encodeFunctionData({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          abi: fnDef.abi as any,
          functionName: fnDef.name,
          args: [addr, sel],
        })
      }
      return null
    } catch {
      return null
    }
  }

  function handlePropose() {
    if (!contractAddress) return
    const innerCalldata = encodeInnerCalldata()
    if (!innerCalldata) return
    proposeTx.reset()

    const calldata = encodeFunctionData({
      abi: HA_BASE_ABI,
      functionName: 'submit',
      args: [innerCalldata],
    })
    proposeTx.mutate({ to: contractAddress as `0x${string}`, data: calldata })
  }

  const innerCalldata = encodeInnerCalldata()
  const canPropose = Boolean(fnDef && innerCalldata && contractAddress)

  // button state
  let btnLabel: string
  let btnDisabled = false
  let btnClass = 'bg-blue-600 text-white hover:bg-blue-700'

  if (!isConnected) {
    btnLabel = 'Connect wallet'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (isWrongChain) {
    btnLabel = 'Wrong network'; btnDisabled = true
    btnClass = 'bg-amber-100 text-amber-600 cursor-not-allowed'
  } else if (!isSafeOwner) {
    btnLabel = 'Not a Safe owner'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (!hasRole) {
    btnLabel = 'Safe lacks TIMELOCK_PROPOSER_ROLE'; btnDisabled = true
    btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
  } else if (proposeTx.isPending) {
    btnLabel = 'Confirm in wallet...'; btnDisabled = true
  } else if (proposeTx.isSuccess) {
    btnLabel = 'Proposed'; btnDisabled = true
    btnClass = 'bg-green-600 text-white cursor-not-allowed'
  } else if (proposeTx.isError) {
    btnLabel = 'Failed — Retry'
    btnClass = 'bg-red-600 text-white hover:bg-red-700'
  } else {
    btnLabel = 'Propose via Safe'
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Queue a timelocked operation. The operation can be executed after the configured delay has passed.
      </p>

      <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        {/* Function selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Function
          </label>
          <select
            value={selectedFn}
            onChange={(e) => { setSelectedFn(e.target.value); setAddressArg(''); setUint256Arg(''); setBytes4Arg(''); proposeTx.reset() }}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          >
            <option value="">Select a function...</option>
            {TIMELOCKED_FUNCTIONS.map((f) => (
              <option key={f.name} value={f.name}>
                {f.signature} ({f.contract === 'fundVault' ? 'FundVault' : 'VaultManagerAdmin'})
              </option>
            ))}
          </select>
        </div>

        {fnDef && (
          <>
            {/* Address arg — shown for address, address_uint256, address_bytes4 */}
            {(fnDef.args === 'address' || fnDef.args === 'address_uint256' || fnDef.args === 'address_bytes4') && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {fnDef.args === 'address_uint256' ? 'Strategy address' : fnDef.args === 'address_bytes4' ? 'Contract address' : 'Address'}
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={addressArg}
                  onChange={(e) => { setAddressArg(e.target.value); proposeTx.reset() }}
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            )}

            {/* uint256 arg — for address_uint256 (setStrategyCap) */}
            {fnDef.args === 'address_uint256' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Cap amount (in token units, 18 decimals)
                </label>
                <input
                  type="text"
                  placeholder="0.0"
                  value={uint256Arg}
                  onChange={(e) => { setUint256Arg(e.target.value); proposeTx.reset() }}
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            )}

            {/* uint256 arg — standalone (setDeviationPps, setMaxNavStaleness, fee rates) */}
            {fnDef.args === 'uint256' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Value (raw uint256)
                </label>
                <input
                  type="text"
                  placeholder="0"
                  value={uint256Arg}
                  onChange={(e) => { setUint256Arg(e.target.value); proposeTx.reset() }}
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            )}

            {/* bytes4 arg — for address_bytes4 (enableFunction) */}
            {fnDef.args === 'address_bytes4' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Function selector (bytes4)
                </label>
                <input
                  type="text"
                  placeholder="0x12345678"
                  value={bytes4Arg}
                  onChange={(e) => { setBytes4Arg(e.target.value); proposeTx.reset() }}
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            )}

            {/* Preview */}
            {innerCalldata && (
              <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-800">
                <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">Preview</p>
                <p className="text-xs text-neutral-700 dark:text-neutral-300">
                  <span className="font-medium">submit(</span>
                  <span className="font-mono">{fnDef.name}(...)</span>
                  <span className="font-medium">)</span>
                  {' → '}
                  <span className="font-mono text-neutral-500">{contractAddress}</span>
                </p>
                {durationSeconds > 0 ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Executable after {durationSeconds}s delay
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-neutral-400">No timelock delay set — operation executes immediately</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePropose}
            disabled={btnDisabled || !canPropose}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              !canPropose
                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
                : btnClass
            }`}
          >
            {btnLabel}
          </button>

          {proposeTx.isPending && (
            <svg className="h-4 w-4 animate-spin text-neutral-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}

          {proposeTx.isSuccess && (
            <Link href="/safe-transactions" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
              View pending transactions
            </Link>
          )}

          {proposeTx.error && (
            <span className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help" title={proposeTx.error.message}>
              {proposeTx.error.message}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
