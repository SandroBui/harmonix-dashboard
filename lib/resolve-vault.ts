import { getVaultGroupOrDefault } from './vaults.config'
import type { VaultGroupConfig } from './vault-group-config'

/**
 * Resolves the active vault group from Next.js page searchParams.
 * Call this at the top of server component page.tsx files.
 *
 * Usage:
 *   export default async function SomePage({ searchParams }: { searchParams: Promise<{ vault?: string }> }) {
 *     const config = resolveVaultFromParams(await searchParams)
 *     const data = await getSomeData(config)
 *   }
 */
export function resolveVaultFromParams(
  params: { vault?: string } | undefined,
): VaultGroupConfig {
  return getVaultGroupOrDefault(params?.vault)
}
