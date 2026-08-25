import type { Metadata } from 'next'
import { getFundStatus } from '@/lib/status-reader'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import { supportsCurrentVaultUI } from '@/lib/vault-version'
import VaultVersionPlaceholder from '@/app/components/VaultVersionPlaceholder'
import StatusClient from './components/StatusClient'
import StatusV2Client from './components/StatusV2Client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Vault Status — Harmonix',
  description: 'Live on-chain status and action history for Harmonix vaults.',
}

function parseDaysParam(days: string | undefined): number {
  if (days === 'all') return 0
  const n = Number(days ?? 30)
  if (n === 7 || n === 30 || n === 90) return n
  return 30
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string; days?: string }>
}) {
  const sp = await searchParams
  const config = resolveVaultFromParams(sp)
  const days = parseDaysParam(sp.days)

  if (config.version === 2) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <StatusV2Client vaultSlug={config.slug} vaultName={config.name} days={days} />
      </main>
    )
  }

  if (!supportsCurrentVaultUI(config)) {
    return <VaultVersionPlaceholder vaultName={config.name} />
  }

  try {
    const data = await getFundStatus(config)
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <StatusClient data={data} />
      </main>
    )
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
}
