import type { Metadata } from 'next'
import { getRolesPageData } from '@/lib/roles-reader'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import RolesClient from './components/RolesClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Roles Management — Harmonix',
  description: 'View and manage role assignments on the AccessManager contract.',
}

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string }>
}) {
  const config = resolveVaultFromParams(await searchParams)
  let data

  try {
    data = await getRolesPageData(config)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
          Roles Management
        </h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to fetch on-chain data: {message}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <RolesClient data={data} />
    </main>
  )
}
