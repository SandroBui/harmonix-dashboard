'use client'

import { useSearchParams } from 'next/navigation'
import { getVaultGroupOrDefault } from '@/lib/vaults.config'
import { VaultProvider } from '@/lib/vault-context'

export default function VaultProviderWrapper({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const vaultSlug = searchParams.get('vault')
  const config = getVaultGroupOrDefault(vaultSlug)

  return <VaultProvider config={config}>{children}</VaultProvider>
}
