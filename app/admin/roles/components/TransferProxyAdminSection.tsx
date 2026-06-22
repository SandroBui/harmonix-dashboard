'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { encodeFunctionData, getAddress, isAddress } from 'viem'
import { OWNABLE_ABI } from '@/lib/abis'
import { useProposeSafeTransaction, useSafeInfo } from '@/lib/safe/hooks'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'
import type { RolesV2ProxyAdminEntry, RolesV2SafeOption } from '@/lib/roles-v2-reader'

type Props = {
  proxyAdmins: RolesV2ProxyAdminEntry[]
  safes: RolesV2SafeOption[]
}

type ExecMode = 'eoa' | 'safe'

function truncate(addr: string) {
  return truncateAddress(addr)
}

export default function TransferProxyAdminSection({ proxyAdmins, safes }: Props) {
  const { address, isConnected, chainId } = useAccount()
  const isWrongChain = isConnected && chainId !== 999

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [newOwnerInput, setNewOwnerInput] = useState('')
  const [execMode, setExecMode] = useState<ExecMode>('eoa')
  const [ownerSafeAddress, setOwnerSafeAddress] = useState('')

  const selected = proxyAdmins[selectedIndex]
  const proxyAdminAddress = selected
    ? (getAddress(selected.proxyAdminAddress) as `0x${string}`)
    : undefined

  const newOwnerTrimmed = newOwnerInput.trim()
  const newOwnerValid = newOwnerTrimmed !== '' && isAddress(newOwnerTrimmed)
  const normalizedNewOwner = newOwnerValid
    ? (getAddress(newOwnerTrimmed) as `0x${string}`)
    : undefined

  const { data: liveOwner, refetch: refetchOwner } = useReadContract({
    address: proxyAdminAddress,
    abi: OWNABLE_ABI,
    functionName: 'owner',
    query: { enabled: Boolean(proxyAdminAddress) },
  })

  const currentOwner = liveOwner
    ? (getAddress(liveOwner) as `0x${string}`)
    : selected
      ? (getAddress(selected.ownerAddress) as `0x${string}`)
      : undefined

  const ownerIsKnownSafe = Boolean(
    currentOwner && safes.some((s) => s.address.toLowerCase() === currentOwner.toLowerCase()),
  )

  const ownerSafeAddr =
    ownerSafeAddress && isAddress(ownerSafeAddress)
      ? (getAddress(ownerSafeAddress) as `0x${string}`)
      : undefined
  const { data: ownerSafeInfo } = useSafeInfo(execMode === 'safe' ? ownerSafeAddr : undefined)
  const isOwnerSafeSigner = Boolean(
    address && ownerSafeInfo?.owners.some((o) => o.toLowerCase() === address.toLowerCase()),
  )

  const proposeTx = useProposeSafeTransaction(ownerSafeAddr)

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

  useEffect(() => {
    if (!currentOwner) return
    const match = safes.find((s) => s.address.toLowerCase() === currentOwner.toLowerCase())
    if (match) setOwnerSafeAddress(match.address)
  }, [currentOwner, safes])

  useEffect(() => {
    if (ownerIsKnownSafe && execMode === 'eoa') setExecMode('safe')
  }, [ownerIsKnownSafe, execMode])

  useEffect(() => {
    if (eoaConfirmed) refetchOwner()
  }, [eoaConfirmed, refetchOwner])

  useEffect(() => {
    if (proposeTx.isSuccess) refetchOwner()
  }, [proposeTx.isSuccess, refetchOwner])

  const sameOwner =
    normalizedNewOwner &&
    currentOwner &&
    normalizedNewOwner.toLowerCase() === currentOwner.toLowerCase()

  const formValid = Boolean(newOwnerValid && proxyAdminAddress && !sameOwner)
  const canExecuteEoa =
    isConnected &&
    !isWrongChain &&
    Boolean(address && currentOwner && address.toLowerCase() === currentOwner.toLowerCase())
  const canExecuteSafe =
    isConnected &&
    !isWrongChain &&
    ownerIsKnownSafe &&
    Boolean(
      ownerSafeAddr &&
        currentOwner &&
        ownerSafeAddr.toLowerCase() === currentOwner.toLowerCase() &&
        isOwnerSafeSigner,
    )
  const canExecute = execMode === 'eoa' ? canExecuteEoa : canExecuteSafe

  const eoaBusy = eoaIsPending || eoaIsConfirming

  function resetTx() {
    resetEoa()
    proposeTx.reset()
  }

  function handleTransferEoa() {
    if (!canExecute || !proxyAdminAddress || !normalizedNewOwner) return
    resetEoa()
    writeContract({
      address: proxyAdminAddress,
      abi: OWNABLE_ABI,
      functionName: 'transferOwnership',
      args: [normalizedNewOwner],
    })
  }

  function handleTransferSafe() {
    if (!canExecute || !proxyAdminAddress || !normalizedNewOwner) return
    proposeTx.reset()
    const data = encodeFunctionData({
      abi: OWNABLE_ABI,
      functionName: 'transferOwnership',
      args: [normalizedNewOwner],
    })
    proposeTx.mutate({ to: proxyAdminAddress, data })
  }

  if (proxyAdmins.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
          Transfer ProxyAdmin Ownership
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No ProxyAdmin contracts found for this vault&apos;s transparent proxies.
        </p>
      </div>
    )
  }

  const activeError =
    execMode === 'eoa'
      ? eoaIsError && eoaError
        ? eoaError.message
        : null
      : proposeTx.error?.message ?? null

  const btnDisabled = !formValid || !canExecute || eoaBusy || proposeTx.isPending
  const btnLabel = !formValid
    ? 'Fill required fields'
    : !canExecute
      ? execMode === 'eoa'
        ? 'Current owner wallet required'
        : 'Owner Safe signer required'
      : eoaBusy || proposeTx.isPending
        ? 'Confirm in wallet…'
        : eoaIsSuccess || proposeTx.isSuccess
          ? execMode === 'eoa'
            ? '✓ Ownership transferred'
            : '✓ Transfer proposed'
          : eoaIsError || proposeTx.isError
            ? 'Transfer ownership — Retry'
            : execMode === 'eoa'
              ? 'Transfer ownership'
              : 'Propose transfer'

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-white">
        Transfer ProxyAdmin Ownership
      </h2>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        Transfer <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ProxyAdmin</code>{' '}
        ownership to a new address (e.g. a Safe). Only the current owner can call{' '}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">transferOwnership</code>.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="proxy-admin-select" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
            ProxyAdmin (via proxy)
          </label>
          <select
            id="proxy-admin-select"
            value={selectedIndex}
            onChange={(e) => {
              setSelectedIndex(Number(e.target.value))
              resetTx()
            }}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {proxyAdmins.map((entry, i) => (
              <option key={entry.proxyAdminAddress} value={i}>
                {entry.label}
              </option>
            ))}
          </select>
          {selected && (
            <div className="mt-2 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
              <p>
                Proxy: {truncate(selected.proxyAddress)}
                <CopyButton value={selected.proxyAddress} />
              </p>
              <p>
                ProxyAdmin: {truncate(selected.proxyAdminAddress)}
                <CopyButton value={selected.proxyAdminAddress} />
              </p>
              <p>
                Current owner: {currentOwner ? truncate(currentOwner) : '…'}
                {currentOwner && <CopyButton value={currentOwner} />}
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="new-proxy-admin-owner" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
            New owner address
          </label>
          <input
            id="new-proxy-admin-owner"
            type="text"
            placeholder="0x…"
            value={newOwnerInput}
            onChange={(e) => {
              setNewOwnerInput(e.target.value)
              resetTx()
            }}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
          />
          {newOwnerTrimmed && !newOwnerValid && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Invalid address</p>
          )}
          {sameOwner && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              New owner must differ from current owner
            </p>
          )}
          {safes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {safes.map((s) => (
                <button
                  key={s.address}
                  type="button"
                  onClick={() => {
                    setNewOwnerInput(s.address)
                    resetTx()
                  }}
                  className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Use {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Execute as</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="radio"
              name="proxy-admin-exec-mode"
              checked={execMode === 'eoa'}
              disabled={ownerIsKnownSafe}
              onChange={() => {
                setExecMode('eoa')
                resetTx()
              }}
            />
            Connected wallet (EOA)
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="radio"
              name="proxy-admin-exec-mode"
              checked={execMode === 'safe'}
              disabled={!ownerIsKnownSafe}
              onChange={() => {
                setExecMode('safe')
                resetTx()
              }}
            />
            Owner Safe (propose)
          </label>
        </div>
        {execMode === 'eoa' && address && currentOwner && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Caller: {truncate(address)}
            {canExecuteEoa ? ' — matches current ProxyAdmin owner' : ' — not the current ProxyAdmin owner'}
          </p>
        )}
        {execMode === 'safe' && (
          <div className="mt-2">
            <select
              value={ownerSafeAddress}
              onChange={(e) => {
                setOwnerSafeAddress(e.target.value)
                resetTx()
              }}
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              {safes.map((s) => (
                <option key={s.address} value={s.address}>
                  {s.label} ({truncate(s.address)})
                </option>
              ))}
            </select>
            {ownerSafeAddr && currentOwner && ownerSafeAddr.toLowerCase() !== currentOwner.toLowerCase() && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Selected Safe is not the current ProxyAdmin owner.
              </p>
            )}
            {ownerSafeAddr && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {isOwnerSafeSigner ? 'You are a Safe owner' : 'You are not an owner of this Safe'}
              </p>
            )}
          </div>
        )}
        {ownerIsKnownSafe && execMode === 'eoa' && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Current owner is a Safe — use Owner Safe (propose).
          </p>
        )}
      </div>

      {!isConnected && (
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">Connect wallet to transfer ownership.</p>
      )}
      {isConnected && isWrongChain && (
        <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">Switch to HyperEVM (chain 999).</p>
      )}

      <div className="flex flex-wrap items-start gap-3">
        {activeError && (
          <span className="max-w-xs truncate text-xs text-red-600 dark:text-red-400" title={activeError}>
            {activeError}
          </span>
        )}
        {proposeTx.isSuccess && execMode === 'safe' && (
          <Link href="/safe-transactions" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            View pending →
          </Link>
        )}
        <button
          type="button"
          onClick={execMode === 'eoa' ? handleTransferEoa : handleTransferSafe}
          disabled={btnDisabled || eoaIsSuccess || proposeTx.isSuccess}
          className={`ml-auto rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            btnDisabled || eoaIsSuccess || proposeTx.isSuccess
              ? 'cursor-not-allowed bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
              : eoaIsError || proposeTx.isError
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
          } ${eoaIsSuccess || proposeTx.isSuccess ? '!bg-green-600 !text-white' : ''}`}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  )
}
