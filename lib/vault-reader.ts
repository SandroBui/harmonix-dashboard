import { HA_VAULT_READER_ABI } from './contracts'
import { getPublicClient } from './client'
import type { VaultGroupConfig } from './vault-group-config'

/** Serializable withdrawal — bigints converted to strings for the client boundary. */
export type Withdrawal = {
  id: string
  vault: string
  controller: string
  shares: string
  assets: string
  requestedAt: number
  isFulfilled: boolean
  originalShares: string
  originalAssets: string
}

const PAGE_SIZE = 100n

/**
 * Returns a map of vault address (lowercase) → asset address (lowercase)
 * for every registered asset vault.
 */
export async function getVaultAssetMap(config: VaultGroupConfig): Promise<Record<string, string>> {
  const publicClient = getPublicClient()
  const assets = await publicClient.readContract({
    address: config.haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getRegisteredAssets',
  })

  const map: Record<string, string> = {}
  await Promise.all(
    assets.map(async (asset) => {
      const vault = await publicClient.readContract({
        address: config.haVaultReaderAddress,
        abi: HA_VAULT_READER_ABI,
        functionName: 'getVaultForAsset',
        args: [asset],
      })
      const zero = '0x0000000000000000000000000000000000000000'
      if (vault.toLowerCase() !== zero) {
        map[vault.toLowerCase()] = asset.toLowerCase()
      }
    })
  )
  return map
}

/**
 * Fetches all withdrawal requests from the on-chain queue in pages of 100.
 * Returns serializable objects (no bigints) ready to pass across the server→client boundary.
 */
export async function getAllWithdrawals(config: VaultGroupConfig): Promise<Withdrawal[]> {
  const publicClient = getPublicClient()
  const length = await publicClient.readContract({
    address: config.haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getRedeemQueueLength',
  })

  if (length === 0n) return []

  const results: Withdrawal[] = []

  for (let fromId = length; fromId >= 1; fromId -= (fromId > PAGE_SIZE ? PAGE_SIZE : fromId)) {
    const toId = fromId - PAGE_SIZE + 1n <= 1 ? 1n : fromId - PAGE_SIZE + 1n

    const page = await publicClient.readContract({
      address: config.haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getPendingWithdrawals',
      // reverse because we traverse backward
      args: [toId, fromId],
    })

    for (const w of page) {
      results.push({
        id: w.id.toString(),
        vault: w.vault.toLowerCase(),
        controller: w.controller.toLowerCase(),
        shares: w.shares.toString(),
        assets: w.assets.toString(),
        requestedAt: Number(w.requestedAt),
        isFulfilled: w.isFulfilled,
        originalShares: w.originalShares.toString(),
        originalAssets: w.originalAssets.toString(),
      })
    }
  }

  results.reverse()
  return results
}

export type WithdrawalsWindow = {
  rows: Withdrawal[]
  totalQueueLength: string
  fromId: string | null
  toId: string | null
  hasOlder: boolean
}

export async function getWithdrawalsWindow(
  config: VaultGroupConfig,
  opts: { sinceTs?: number; untilTs?: number; fromId?: bigint; toId?: bigint } = {},
): Promise<WithdrawalsWindow> {
  const publicClient = getPublicClient()

  const length = await publicClient.readContract({
    address: config.haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getRedeemQueueLength',
  })

  if (length === 0n) {
    return { rows: [], totalQueueLength: '0', fromId: null, toId: null, hasOlder: false }
  }

  let fromId: bigint
  if (opts.fromId !== undefined) {
    fromId = opts.fromId
  } else if (opts.sinceTs !== undefined) {
    fromId = await publicClient.readContract({
      address: config.haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'findFirstRedeemIdAfter',
      args: [BigInt(opts.sinceTs)],
    })
    if (fromId === 0n) {
      return {
        rows: [],
        totalQueueLength: length.toString(),
        fromId: null,
        toId: null,
        hasOlder: length > 0n,
      }
    }
  } else {
    fromId = 1n
  }

  let toId: bigint
  if (opts.toId !== undefined) {
    toId = opts.toId
  } else if (opts.untilTs !== undefined) {
    const firstAfterEnd = await publicClient.readContract({
      address: config.haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'findFirstRedeemIdAfter',
      args: [BigInt(opts.untilTs + 1)],
    })
    toId = firstAfterEnd === 0n ? length : firstAfterEnd - 1n
  } else {
    toId = length
  }

  if (fromId < 1n) fromId = 1n
  if (toId > length) toId = length
  if (fromId > toId) {
    return {
      rows: [],
      totalQueueLength: length.toString(),
      fromId: null,
      toId: null,
      hasOlder: fromId > 1n,
    }
  }

  const rows: Withdrawal[] = []
  for (let cur = fromId; cur <= toId; cur += PAGE_SIZE) {
    const chunkTo = cur + PAGE_SIZE - 1n > toId ? toId : cur + PAGE_SIZE - 1n
    const page = await publicClient.readContract({
      address: config.haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getPendingWithdrawals',
      args: [cur, chunkTo],
    })
    for (const w of page) {
      rows.push({
        id: w.id.toString(),
        vault: w.vault.toLowerCase(),
        controller: w.controller.toLowerCase(),
        shares: w.shares.toString(),
        assets: w.assets.toString(),
        requestedAt: Number(w.requestedAt),
        isFulfilled: w.isFulfilled,
        originalShares: w.originalShares.toString(),
        originalAssets: w.originalAssets.toString(),
      })
    }
  }

  rows.reverse()

  return {
    rows,
    totalQueueLength: length.toString(),
    fromId: fromId.toString(),
    toId: toId.toString(),
    hasOlder: fromId > 1n,
  }
}
