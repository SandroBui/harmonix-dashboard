'use client'

import { createContext, useContext } from 'react'
import type { VaultGroupConfig } from './vault-group-config'

const VaultContext = createContext<VaultGroupConfig | null>(null)

export function VaultProvider({
  config,
  children,
}: {
  config: VaultGroupConfig
  children: React.ReactNode
}) {
  return <VaultContext.Provider value={config}>{children}</VaultContext.Provider>
}

/**
 * Returns the active vault group config.
 * Must be used within a VaultProvider.
 */
export function useVaultConfig(): VaultGroupConfig {
  const config = useContext(VaultContext)
  if (!config) {
    throw new Error('useVaultConfig must be used within a VaultProvider')
  }
  return config
}
