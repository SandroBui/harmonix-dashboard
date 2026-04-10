import type { Metadata } from 'next'
import SafeTxClient from './components/SafeTxClient'
import { getVaultAssetMap } from '@/lib/vault-reader'
import { resolveVaultFromParams } from '@/lib/resolve-vault'

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
