import type { Metadata } from 'next'
import { getNavPageData } from '@/lib/nav-reader'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import { supportsCurrentVaultUI } from '@/lib/vault-version'
import VaultVersionPlaceholder from '@/app/components/VaultVersionPlaceholder'
import NavClient from './components/NavClient'
import NavV2Client from './components/NavV2Client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'NAV Management — Harmonix',
  description: 'View and update Net Asset Value components for the Harmonix fund.',
}

export default async function NavPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string }>
}) {
  const config = resolveVaultFromParams(await searchParams)
  const isV2 = config.version === 2
  // v2 is allowed on this page; v3 and others still use the original gate.
  if (!isV2 && !supportsCurrentVaultUI(config)) {
    return <VaultVersionPlaceholder vaultName={config.name} />
  }
  let data

  try {
    data = await getNavPageData(config)
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
      {isV2 ? <NavV2Client data={data} /> : <NavClient data={data} />}
    </main>
  )
}
