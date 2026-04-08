'use client'

import { useConnection, useConnect, useDisconnect, useSwitchChain, useConnectors } from 'wagmi'
import { hyperEvmMainnet } from '@/lib/wagmi-config'

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function ConnectWallet() {
  const { address, isConnected, chainId } = useConnection()
  const connectors = useConnectors()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

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
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        {truncateAddress(address!)}
      </span>
      <button
        onClick={() => disconnect()}
        className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
      >
        Disconnect
      </button>
    </div>
  )
}
