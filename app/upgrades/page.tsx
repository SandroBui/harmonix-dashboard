import type { Metadata } from 'next'
import UpgradesClient from './components/UpgradesClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Upgrades — Harmonix' }

export default function UpgradesPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">Upgrades</h1>
      <UpgradesClient />
    </main>
  )
}
