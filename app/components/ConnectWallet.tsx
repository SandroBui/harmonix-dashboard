'use client'

import { useEffect, useRef, useState } from 'react'
import { useConnection, useConnect, useDisconnect, useSwitchChain, useConnectors } from 'wagmi'
import { hyperEvmMainnet } from '@/lib/wagmi-config'
import CopyButton from '@/app/components/CopyButton'

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function ConnectWallet() {
  const { address, isConnected, chainId } = useConnection()
  const connectors = useConnectors()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        disabled={isConnecting || connectors.length === 0}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    )
  }

  if (chainId !== hyperEvmMainnet.id) {
    return (
      <button
        onClick={() => switchChain({ chainId: hyperEvmMainnet.id })}
        disabled={isSwitching}
        className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSwitching ? 'Switching…' : 'Switch to HyperEVM'}
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-xs text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Wallet menu"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {truncateAddress(address!)}
        </button>
        <CopyButton value={address!} />
      </div>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[140px] overflow-hidden rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              disconnect()
            }}
            className="block w-full rounded px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
