'use client'

import { usePathname } from 'next/navigation'
import { useVaultConfig } from '@/lib/vault-context'
import { supportsCurrentVaultUI } from '@/lib/vault-version'
import VaultVersionPlaceholder from './components/VaultVersionPlaceholder'

const V2_ALLOWED_PATHS = [
  '/status',
  '/vault-config',
  '/admin/nav',
  '/admin/roles',
  '/strategies',
  '/withdrawals',
  '/upgrades',
  '/safe-transactions',
  '/emergency',
]

export default function VaultVersionGate({ children }: { children: React.ReactNode }) {
  const config = useVaultConfig()
  const pathname = usePathname()

  // v2: only NAV Management and Strategies are available; other routes stay empty.
  if (config.version === 2) {
    if (!V2_ALLOWED_PATHS.includes(pathname)) {
      return <VaultVersionPlaceholder vaultName={config.name} />
    }
    return children
  }

  if (!supportsCurrentVaultUI(config)) {
    return <VaultVersionPlaceholder vaultName={config.name} />
  }

  return children
}
