import { getAllWithdrawals, getVaultAssetMap } from '@/lib/vault-reader'
import WithdrawalsClient from './components/WithdrawalsClient'
import RefreshButton from './components/RefreshButton'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Withdrawals — Harmonix',
}

export default async function WithdrawalsPage() {
  let withdrawals
  let vaultAssetMap: Record<string, string>

  try {
    ;[withdrawals, vaultAssetMap] = await Promise.all([getAllWithdrawals(), getVaultAssetMap()])
  } catch {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
          Withdrawals
        </h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to fetch withdrawal data from the network. Please try again later.
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6 flex items-start gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Withdrawals</h1>
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-sm font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {withdrawals.length}
        </span>
        <div className="ml-auto">
          <RefreshButton />
        </div>
      </div>

      <WithdrawalsClient withdrawals={withdrawals} vaultAssetMap={vaultAssetMap} />
    </main>
  )
}
