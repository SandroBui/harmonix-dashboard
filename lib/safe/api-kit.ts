import SafeApiKit from '@safe-global/api-kit'

const kits = new Map<number, SafeApiKit>()

/**
 * Returns a cached SafeApiKit instance for the given chainId (default: 999 HyperEVM).
 * NEXT_PUBLIC_SAFE_API_KEY must be set — get a free key at https://developer.safe.global
 */
export function getApiKit(chainId: number = 999): SafeApiKit {
  const existing = kits.get(chainId)
  if (existing) return existing

  const apiKey = process.env.NEXT_PUBLIC_SAFE_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_SAFE_API_KEY is not set. Get a free key at https://developer.safe.global')

  const kit = new SafeApiKit({ chainId: BigInt(chainId), apiKey })
  kits.set(chainId, kit)
  return kit
}
