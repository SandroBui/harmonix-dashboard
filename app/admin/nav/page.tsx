import type { Metadata } from 'next'
import { getNavPageData } from '@/lib/nav-reader'
import NavClient from './components/NavClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'NAV Management — Harmonix',
  description: 'View and update Net Asset Value components for the Harmonix fund.',
}

export default async function NavPage() {
  let data

  try {
    data = await getNavPageData()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
          NAV Management
        </h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to fetch on-chain data: {message}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <NavClient data={data} />
    </main>
  )
}
