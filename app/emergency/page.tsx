import { toFunctionSelector } from 'viem'
import {
  HA_VAULT_READER_ABI,
  FUND_NAV_FEED_ABI,
  VAULT_MANAGER_ABI,
} from '@/lib/contracts'
import { getPublicClient } from '@/lib/client'
import { resolveVaultFromParams } from '@/lib/resolve-vault'
import { getFundStatus } from '@/lib/status-reader'
import EmergencyClient from './components/EmergencyClient'

export const dynamic = 'force-dynamic'

// Functions we track disabled status for
const TRACKED_FUNCTIONS = [
  { label: 'deposit', signature: 'deposit(uint256,address)' },
  { label: 'mint', signature: 'mint(uint256,address)' },
  { label: 'requestRedeem', signature: 'requestRedeem(uint256,address,address,uint256)' },
] as const

export type DisabledFunctionsMap = Record<string, Record<string, boolean>>

export default async function EmergencyPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string }>
}) {
  const config = resolveVaultFromParams(await searchParams)
  const { haVaultReaderAddress } = config

  const publicClient = getPublicClient()

  let data: Awaited<ReturnType<typeof getFundStatus>> | null = null
  let vaultManagerAdminAddress = ''
  let fundVaultAddress = ''
  let fundVaultPaused = false
  let disabledFunctions: DisabledFunctionsMap = {}
  let error = ''

  try {
    // Get FundNavFeed from reader
    const fundNavFeedAddress = await publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getFundNav',
    }) as `0x${string}`

    const [status, vaultManagerAddress] = await Promise.all([
      getFundStatus(config),
      publicClient.readContract({
        address: fundNavFeedAddress,
        abi: FUND_NAV_FEED_ABI,
        functionName: 'vaultManager',
      }) as Promise<`0x${string}`>,
    ])
    data = status

    const [fundVault, adminFacet] = await Promise.all([
      publicClient.readContract({
        address: haVaultReaderAddress,
        abi: HA_VAULT_READER_ABI,
        functionName: 'getFundVault',
      }) as Promise<`0x${string}`>,
      publicClient.readContract({
        address: vaultManagerAddress,
        abi: VAULT_MANAGER_ABI,
        functionName: 'adminFacet',
      }) as Promise<`0x${string}`>,
    ])

    fundVaultAddress = fundVault.toLowerCase()
    vaultManagerAdminAddress = adminFacet.toLowerCase()

    // Read FundVault pause state from VaultManager
    fundVaultPaused = await publicClient.readContract({
      address: vaultManagerAddress,
      abi: VAULT_MANAGER_ABI,
      functionName: 'pauseStatus',
      args: [fundVault],
    }) as boolean

    // Read disabled function status for all vaults
    if (status.vaults.length > 0) {
      const selectors = TRACKED_FUNCTIONS.map((f) => toFunctionSelector(f.signature))
      // Build parallel arrays: one entry per vault × function
      const haContracts: `0x${string}`[] = []
      const selectorArgs: `0x${string}`[] = []
      for (const v of status.vaults) {
        for (const sel of selectors) {
          haContracts.push(v.vault as `0x${string}`)
          selectorArgs.push(sel)
        }
      }

      const results = await publicClient.readContract({
        address: haVaultReaderAddress,
        abi: HA_VAULT_READER_ABI,
        functionName: 'getFunctionDisabledBatch',
        args: [haContracts, selectorArgs],
      }) as boolean[]

      // Reassemble into map
      let idx = 0
      for (const v of status.vaults) {
        const vaultMap: Record<string, boolean> = {}
        for (const fn of TRACKED_FUNCTIONS) {
          vaultMap[fn.label] = results[idx++]
        }
        disabledFunctions[v.vault] = vaultMap
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-red-600 dark:text-red-400">
        Emergency Actions
      </h1>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to fetch on-chain data: {error}
        </div>
      ) : data ? (
        <EmergencyClient
          vaults={data.vaults}
          vaultManagerAdminAddress={vaultManagerAdminAddress}
          fundVaultAddress={fundVaultAddress}
          fundVaultPaused={fundVaultPaused}
          disabledFunctions={disabledFunctions}
        />
      ) : null}
    </main>
  )
}
