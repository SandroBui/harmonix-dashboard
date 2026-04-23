import { getWithdrawalsWindow, getVaultAssetMap } from '@/lib/vault-reader'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import WithdrawalsClient from './components/WithdrawalsClient'
import RefreshButton from './components/RefreshButton'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Withdrawals — Harmonix',
}

export default async function WithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string; days?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const config = resolveVaultFromParams(sp)

  const days = sp.days === 'all' ? 0 : Number(sp.days ?? 7)
  const nowSec = Math.floor(Date.now() / 1000)
  const windowOpts =
    sp.from || sp.to
      ? {
          fromId: sp.from ? BigInt(sp.from) : undefined,
          toId: sp.to ? BigInt(sp.to) : undefined,
        }
      : days > 0
        ? { sinceTs: nowSec - days * 86400 }
        : {}

  let windowResult
  let vaultAssetMap: Record<string, string>

  try {
    ;[windowResult, vaultAssetMap] = await Promise.all([
      getWithdrawalsWindow(config, windowOpts),
      getVaultAssetMap(config),
    ])
  } catch (err) {
    console.error('[withdrawals] fetch failed', err)
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
          {windowResult.rows.length} / {windowResult.totalQueueLength}
        </span>
        <div className="ml-auto">
          <RefreshButton />
        </div>
      </div>

      <WithdrawalsClient
        withdrawals={windowResult.rows}
        vaultAssetMap={vaultAssetMap}
        windowMeta={{
          totalQueueLength: windowResult.totalQueueLength,
          fromId: windowResult.fromId,
          toId: windowResult.toId,
          hasOlder: windowResult.hasOlder,
          days,
        }}
      />
    </main>
  )
}
