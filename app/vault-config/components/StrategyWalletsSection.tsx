'use client'

import CopyButton from '@/app/components/CopyButton'
import { truncateAddress } from '@/lib/format'
import { getSafeChainLabel } from '@/lib/safe/chains'
import { useVaultConfig } from '@/lib/vault-context'

export default function StrategyWalletsSection() {
  const { safe, chainId } = useVaultConfig()
  const wallets = safe.strategyWallets ?? []

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-white">
        Strategy Wallets
      </h2>
      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white px-5 dark:divide-neutral-800 dark:border-neutral-700 dark:bg-neutral-900">
        {wallets.length === 0 ? (
          <p className="py-3 text-sm text-neutral-400 dark:text-neutral-500">
            No strategy wallets configured for this vault.
          </p>
        ) : (
          wallets.map((wallet, index) => (
            <div
              key={`${index}-${wallet.address}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="text-sm text-neutral-500 dark:text-neutral-400">{wallet.name}</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-sm text-neutral-900 dark:text-neutral-100">
                {wallet.chainId !== undefined && wallet.chainId !== chainId && (
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-sans text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {getSafeChainLabel(wallet.chainId)}
                  </span>
                )}
                {truncateAddress(wallet.address)}
                <CopyButton value={wallet.address} />
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
