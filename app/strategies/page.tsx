import type { Metadata } from 'next'
import { getStrategyPageData } from '@/lib/strategy-reader'
import RefreshButton from '../withdrawals/components/RefreshButton'
import StrategyClient from './components/StrategyClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Strategies — Harmonix' }

export default async function StrategiesPage() {
  let data
  try {
    data = await getStrategyPageData()
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
