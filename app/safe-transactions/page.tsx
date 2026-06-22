import type { Metadata } from 'next'
import SafeTxClient from './components/SafeTxClient'
import SafeTxV2Client from './components/SafeTxV2Client'
import { getVaultAssetMap } from '@/lib/vault-reader'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import { supportsCurrentVaultUI } from '@/lib/vault-version'
import VaultVersionPlaceholder from '@/app/components/VaultVersionPlaceholder'

export const metadata: Metadata = {
  title: 'Safe Transactions — Harmonix',
  description: 'Pending multisig transactions for the Harmonix Safe wallet',
}

export default async function SafeTransactionsPage({
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
    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
          Safe Transactions
        </h1>
        <SafeTxV2Client vaultAssetMap={{}} />
      </main>
    )
  }

  const vaultAssetMap = await getVaultAssetMap(config)
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
        Safe Transactions
      </h1>
      <SafeTxClient vaultAssetMap={vaultAssetMap} />
    </main>
  )
}
