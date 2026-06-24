import type { VaultGroupConfig } from './vault-group-config'
import { getFundAdminManagerAddress as resolveFundAdminManagerAddress } from './nav-contract-targets'

/** v2: Fund Contract Reader (HaVaultReader) address — always configured on vault groups. */
export function getFundContractReaderAddress(config: VaultGroupConfig): `0x${string}` {
  if (config.version !== 2) {
    throw new Error(
      `getFundContractReaderAddress is only for v2 vaults (got version ${config.version})`,
    )
  }
  return config.haVaultReaderAddress
}

/** v2: Fund Admin Manager address — required for vault config updates. */
export function getFundAdminManagerAddress(config: VaultGroupConfig): `0x${string}` {
  return resolveFundAdminManagerAddress(config)
}
