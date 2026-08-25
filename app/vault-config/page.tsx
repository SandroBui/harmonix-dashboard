import type { Metadata } from 'next'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import { supportsCurrentVaultUI } from '@/lib/vault-version'
import { getVaultConfigV2Data } from '@/lib/vault-config-v2-reader'
import VaultVersionPlaceholder from '@/app/components/VaultVersionPlaceholder'
import VaultConfigClient from './components/VaultConfigClient'
import VaultConfigV2Client from './components/VaultConfigV2Client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Vault Config — Harmonix' }

export default async function VaultConfigPage({
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
    try {
      const data = await getVaultConfigV2Data(config)
      return (
        <main className="mx-auto max-w-7xl px-4 py-10">
          <VaultConfigV2Client data={data} />
        </main>
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return (
        <main className="mx-auto max-w-7xl px-4 py-10">
          <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
            Vault Configuration
          </h1>
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            Failed to fetch on-chain data: {message}
          </div>
        </main>
      )
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <VaultConfigClient />
    </main>
  )
}
