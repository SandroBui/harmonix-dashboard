import type { Metadata } from 'next'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import { supportsCurrentVaultUI } from '@/lib/vault-version'
import VaultVersionPlaceholder from '@/app/components/VaultVersionPlaceholder'
import UpgradesClient from './components/UpgradesClient'
import UpgradesV2Client from './components/UpgradesV2Client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Upgrades — Harmonix' }

export default async function UpgradesPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string }>
}) {
  const config = resolveVaultFromParams(await searchParams)

  if (config.version === 2) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">Upgrades</h1>
        <UpgradesV2Client />
      </main>
    )
  }

  if (!supportsCurrentVaultUI(config)) {
    return <VaultVersionPlaceholder vaultName={config.name} />
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">Upgrades</h1>
      <UpgradesClient />
    </main>
  )
}
