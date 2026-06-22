import type { VaultGroupConfig } from './vault-group-config'

/** Vault versions with the current dashboard UI implemented */
export const SUPPORTED_UI_VERSION = 3

export function supportsCurrentVaultUI(config: VaultGroupConfig): boolean {
  return config.version === SUPPORTED_UI_VERSION
}
