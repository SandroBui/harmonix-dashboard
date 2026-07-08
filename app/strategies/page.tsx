import type { Metadata } from 'next'
import { getStrategyPageData } from '@/lib/strategy-reader'
import { getStrategyV2PageData } from '@/lib/strategy-v2-reader'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import { supportsCurrentVaultUI } from '@/lib/vault-version'
import VaultVersionPlaceholder from '@/app/components/VaultVersionPlaceholder'
import RefreshButton from '../withdrawals/components/RefreshButton'
import { V2_AUTO_REFRESH_MS } from '@/lib/v2-auto-refresh'
import StrategyClient from './components/StrategyClient'
import StrategiesV2Client from './components/StrategiesV2Client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Strategies — Harmonix' }

export default async function StrategiesPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string }>
}) {
  const config = resolveVaultFromParams(await searchParams)
  const isV2 = config.version === 2

  if (!isV2 && !supportsCurrentVaultUI(config)) {
    return <VaultVersionPlaceholder vaultName={config.name} />
  }

  if (isV2) {
    let v2Data
    try {
      v2Data = await getStrategyV2PageData(config)
    } catch (err) {
      return (
        <main className="mx-auto max-w-7xl px-4 py-10">
          <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">Strategies</h1>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            Failed to load strategy data. {String(err)}
          </div>
        </main>
      )
    }

    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 flex items-start gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Strategies</h1>
          <div className="ml-auto"><RefreshButton autoRefreshMs={V2_AUTO_REFRESH_MS} /></div>
        </div>
        <StrategiesV2Client data={v2Data} />
      </main>
    )
  }

  let data
  try {
    data = await getStrategyPageData(config)
  } catch (err) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">Strategies</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Failed to load strategy data. {String(err)}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6 flex items-start gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Strategies</h1>
        <div className="ml-auto"><RefreshButton /></div>
      </div>
      <StrategyClient data={data} />
    </main>
  )
}
