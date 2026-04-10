'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { encodeFunctionData, getAddress, toFunctionSelector } from 'viem'
import { VAULT_MANAGER_ADMIN_ABI, VAULT_ASSET_ABI } from '@/lib/contracts'
import { useProposeSafeTransaction, useRoleCheck } from '@/lib/safe/hooks'
import type { VaultOverviewData } from '@/lib/status-reader'
import type { DisabledFunctionsMap } from '../page'

const AUTO_REFRESH_MS = 30_000

// Functions that can be disabled on VaultAsset contracts
const DISABLEABLE_FUNCTIONS = [
  { label: 'deposit', signature: 'deposit(uint256,address)' },
  { label: 'mint', signature: 'mint(uint256,address)' },
  { label: 'requestRedeem', signature: 'requestRedeem(uint256,address,address,uint256)' },
] as const

// Descriptions of what pausing blocks, per contract type
const PAUSE_IMPACT: Record<string, string> = {
  fundVault: 'Blocks: allocate, deallocate, and withdraw assets to/from strategies',
  assetVault: 'Blocks: deposit, mint, redeem, withdraw, and all redemption requests',
}

type Props = {
  vaults: VaultOverviewData[]
  vaultManagerAdminAddress: string
  fundVaultAddress: string
  fundVaultPaused: boolean
  disabledFunctions: DisabledFunctionsMap
}

export default function EmergencyClient({ vaults, vaultManagerAdminAddress, fundVaultAddress, fundVaultPaused, disabledFunctions }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      startTransition(() => router.refresh())
    }, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [router])

  return (
    <div className="space-y-10">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Perform emergency operations on vaults. All actions are proposed via Safe multisig and require admin role.
      </p>

      <PauseSection
        vaults={vaults}
        vaultManagerAdminAddress={vaultManagerAdminAddress}
        fundVaultAddress={fundVaultAddress}
        fundVaultPaused={fundVaultPaused}
      />

      <DisableFunctionsSection
        vaults={vaults}
        vaultManagerAdminAddress={vaultManagerAdminAddress}
        disabledFunctions={disabledFunctions}
      />
    </div>
  )
}

// ─── Pause / Unpause Section ────────────────────────────────────────────────

function PauseSection({
  vaults,
  vaultManagerAdminAddress,
  fundVaultAddress,
  fundVaultPaused,
}: {
  vaults: VaultOverviewData[]
  vaultManagerAdminAddress: string
  fundVaultAddress: string
  fundVaultPaused: boolean
}) {
  const { isConnected, chainId } = useAccount()
  const { safeAddress, isSafeOwner, hasRole } = useRoleCheck('admin')
  const proposeTx = useProposeSafeTransaction(safeAddress)

  const isWrongChain = isConnected && chainId !== 999
  const [proposingFor, setProposingFor] = useState<string | null>(null)

  function handlePause(contractAddr: string, shouldPause: boolean) {
    setProposingFor(contractAddr)
    proposeTx.reset()

    const data = encodeFunctionData({
      abi: VAULT_MANAGER_ADMIN_ABI,
      functionName: 'setPauseStatus',
      args: [getAddress(contractAddr), shouldPause],
    })

    proposeTx.mutate({
      to: getAddress(vaultManagerAdminAddress) as `0x${string}`,
      data,
    })
  }

  // Build the list of contracts: all AssetVaults + FundVault
  const contracts: { address: string; label: string; isPaused: boolean; type: 'assetVault' | 'fundVault' }[] = [
    ...vaults.map((v) => ({
      address: v.vault,
      label: `${v.symbol} Vault`,
      isPaused: v.isPaused,
      type: 'assetVault' as const,
    })),
  ]
  if (fundVaultAddress) {
    contracts.push({
      address: fundVaultAddress,
      label: 'FundVault',
      isPaused: fundVaultPaused,
      type: 'fundVault',
    })
  }

  // Button state builder
  function getButtonState(isPaused: boolean, contractAddr: string) {
    const isThisOne = proposingFor === contractAddr
    const action = isPaused ? 'Unpause' : 'Pause'

    let label: string
    let disabled = false
    let btnClass = isPaused
      ? 'bg-green-600 text-white hover:bg-green-700'
      : 'bg-red-600 text-white hover:bg-red-700'

    if (!isConnected) {
      label = 'Connect wallet'; disabled = true
      btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
    } else if (isWrongChain) {
      label = 'Wrong network'; disabled = true
      btnClass = 'bg-amber-100 text-amber-600 cursor-not-allowed'
    } else if (!isSafeOwner) {
      label = 'Not a Safe owner'; disabled = true
      btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
    } else if (!hasRole) {
      label = 'Safe lacks ADMIN role'; disabled = true
      btnClass = 'bg-neutral-200 text-neutral-400 cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-500'
    } else if (isThisOne && proposeTx.isPending) {
      label = 'Confirm in wallet...'; disabled = true
    } else if (isThisOne && proposeTx.isSuccess) {
      label = `${action} Proposed`; disabled = true
      btnClass = 'bg-green-600 text-white cursor-not-allowed'
    } else if (isThisOne && proposeTx.isError) {
      label = `${action} — Retry`
      btnClass = 'bg-red-600 text-white hover:bg-red-700'
    } else {
      label = action
    }

    return { label, disabled, btnClass }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Pause / Unpause Contracts
      </h2>
      <div className="space-y-3">
        {contracts.map((c) => {
          const btn = getButtonState(c.isPaused, c.address)
          const isThisOne = proposingFor === c.address
          const impact = PAUSE_IMPACT[c.type]
          return (
            <div
              key={c.address}
              className="group/card relative flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-md bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/card:opacity-100 dark:bg-neutral-700 dark:ring-1 dark:ring-neutral-600 w-72">
                {impact}
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-700" />
              </div>

              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{c.label}</p>
                <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400">{c.address}</p>
                <span
                  className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    c.isPaused
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}
                >
                  {c.isPaused ? 'Paused' : 'Active'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePause(c.address, !c.isPaused)}
                  disabled={btn.disabled}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${btn.btnClass}`}
                >
                  {btn.label}
                </button>

                {isThisOne && proposeTx.isPending && (
                  <svg className="h-4 w-4 animate-spin text-neutral-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}

                {isThisOne && proposeTx.isSuccess && (
                  <Link href="/safe-transactions" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                    View pending
                  </Link>
                )}

                {isThisOne && proposeTx.error && (
                  <span className="max-w-xs truncate text-xs text-red-600 dark:text-red-400 cursor-help" title={proposeTx.error.message}>
                    {proposeTx.error.message}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Disable Functions Section ──────────────────────────────────────────────

function DisableFunctionsSection({
  vaults,
  vaultManagerAdminAddress,
  disabledFunctions,
}: {
  vaults: VaultOverviewData[]
  vaultManagerAdminAddress: string
  disabledFunctions: DisabledFunctionsMap
}) {
  const { isConnected, chainId } = useAccount()
  const { safeAddress, isSafeOwner, hasRole } = useRoleCheck('admin')
  const proposeTx = useProposeSafeTransaction(safeAddress)

  const isWrongChain = isConnected && chainId !== 999

  const [selectedVault, setSelectedVault] = useState('')
  const [selectedFn, setSelectedFn] = useState('')
  const [disableAction, setDisableAction] = useState(true) // true = disable, false = enable

  const fnDef = DISABLEABLE_FUNCTIONS.find((f) => f.label === selectedFn)
  const selector = fnDef ? toFunctionSelector(fnDef.signature) : null

  // Auto-toggle action based on current state when vault or function changes
  function handleVaultChange(vault: string) {
    setSelectedVault(vault)
    proposeTx.reset()
    if (vault && selectedFn) {
      const isDisabled = disabledFunctions[vault]?.[selectedFn] ?? false
      setDisableAction(!isDisabled)
    }
  }

  function handleFnChange(fn: string) {
    setSelectedFn(fn)
    proposeTx.reset()
    if (selectedVault && fn) {
      const isDisabled = disabledFunctions[selectedVault]?.[fn] ?? false
      setDisableAction(!isDisabled)
    }
  }

  function handlePropose() {
    if (!selectedVault || !selector) return
    proposeTx.reset()

    const data = encodeFunctionData({
      abi: VAULT_MANAGER_ADMIN_ABI,
      functionName: 'setFunctionDisabled',
      args: [getAddress(selectedVault), selector, disableAction],
    })

    proposeTx.mutate({
      to: getAddress(vaultManagerAdminAddress) as `0x${string}`,
      data,
    })
  }

  const canPropose = Boolean(selectedVault && selector)

  // Button state
  let btnLabel: string
  let btnDisabled = false
  let btnClass = 'bg-red-600 text-white hover:bg-red-700'

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
    btnLabel = 'Safe lacks ADMIN role'; btnDisabled = true
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
    btnLabel = disableAction ? 'Disable Function' : 'Enable Function'
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Disable / Enable Vault Functions
      </h2>

      {/* Status table */}
      <div className="mb-6 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-800">
              <th className="px-4 py-2.5 text-left font-medium text-neutral-700 dark:text-neutral-300">Vault</th>
              {DISABLEABLE_FUNCTIONS.map((f) => (
                <th key={f.label} className="px-4 py-2.5 text-center font-medium text-neutral-700 dark:text-neutral-300">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vaults.map((v) => (
              <tr key={v.vault} className="border-t border-neutral-200 dark:border-neutral-700">
                <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-white">
                  {v.symbol} Vault
                  <span className="ml-1 text-xs font-mono text-neutral-400">{v.vault.slice(0, 6)}...{v.vault.slice(-4)}</span>
                </td>
                {DISABLEABLE_FUNCTIONS.map((f) => {
                  const isDisabled = disabledFunctions[v.vault]?.[f.label] ?? false
                  return (
                    <td key={f.label} className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          isDisabled
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}
                      >
                        {isDisabled ? 'Disabled' : 'Enabled'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action form */}
      <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        {/* Vault selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Vault
          </label>
          <select
            value={selectedVault}
            onChange={(e) => handleVaultChange(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          >
            <option value="">Select a vault...</option>
            {vaults.map((v) => (
              <option key={v.vault} value={v.vault}>
                {v.symbol} Vault ({v.vault.slice(0, 6)}...{v.vault.slice(-4)})
              </option>
            ))}
          </select>
        </div>

        {/* Function selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Function
          </label>
          <select
            value={selectedFn}
            onChange={(e) => handleFnChange(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          >
            <option value="">Select a function...</option>
            {DISABLEABLE_FUNCTIONS.map((f) => (
              <option key={f.label} value={f.label}>
                {f.signature}
              </option>
            ))}
          </select>
        </div>

        {/* Action toggle */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Action
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="disableAction"
                checked={disableAction}
                onChange={() => { setDisableAction(true); proposeTx.reset() }}
                className="accent-red-600"
              />
              Disable
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="radio"
                name="disableAction"
                checked={!disableAction}
                onChange={() => { setDisableAction(false); proposeTx.reset() }}
                className="accent-green-600"
              />
              Enable
            </label>
          </div>
        </div>

        {/* Preview */}
        {selectedVault && selector && (
          <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-800">
            <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">Preview</p>
            <p className="text-xs text-neutral-700 dark:text-neutral-300">
              <span className="font-medium">setFunctionDisabled(</span>
              <span className="font-mono">{selectedVault.slice(0, 6)}...{selectedVault.slice(-4)}</span>
              {', '}
              <span className="font-mono">{selector}</span>
              {', '}
              <span className={`font-medium ${disableAction ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {disableAction ? 'true' : 'false'}
              </span>
              <span className="font-medium">)</span>
              {' → '}
              <span className="font-mono text-neutral-500">{vaultManagerAdminAddress}</span>
            </p>
          </div>
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
    </section>
  )
}
