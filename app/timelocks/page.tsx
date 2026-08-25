import type { Metadata } from 'next'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import { supportsCurrentVaultUI } from '@/lib/vault-version'
import VaultVersionPlaceholder from '@/app/components/VaultVersionPlaceholder'
import TimelockClient from './components/TimelockClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Timelocks — Harmonix' }

export default async function TimelocksPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string }>
}) {
  const config = resolveVaultFromParams(await searchParams)
  if (!supportsCurrentVaultUI(config)) {
    return <VaultVersionPlaceholder vaultName={config.name} />
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">Timelocks</h1>
      <TimelockClient />
    </main>
  )
}
