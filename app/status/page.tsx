import type { Metadata } from 'next'
import { getFundStatus } from '@/lib/status-reader'
import RefreshButton from '../withdrawals/components/RefreshButton'
import StatusClient from './components/StatusClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Architecture Status — Harmonix',
  description: 'Live on-chain status of the Harmonix fund architecture.',
}

export default async function StatusPage() {
  let data

  try {
    data = await getFundStatus()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
          Architecture Status
        </h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to fetch on-chain data: {message}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          Architecture Status
        </h1>
        <div className="ml-auto">
          <RefreshButton />
        </div>
      </div>
      <StatusClient data={data} />
    </main>
  )
}
