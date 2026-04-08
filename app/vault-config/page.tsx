import type { Metadata } from 'next'
import VaultConfigClient from './components/VaultConfigClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Vault Config — Harmonix' }

export default function VaultConfigPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <VaultConfigClient />
    </main>
  )
}
