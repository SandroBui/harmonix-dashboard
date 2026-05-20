import SafeApiKit from '@safe-global/api-kit'

const kits = new Map<number, SafeApiKit>()

/**
 * Absolute origin for the Safe proxy route. SafeApiKit builds request URLs with
 * `new URL(...)`, so the base must be absolute. On the client we use the page
 * origin; the server fallback keeps a future server-side caller from throwing.
 */
function getOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return process.env.SAFE_PROXY_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

/**
 * Returns a cached SafeApiKit instance for the given chainId (default: 999 HyperEVM).
 *
 * Requests are routed through our own `/api/safe/[chainId]` proxy, which injects the
 * server-only SAFE_API_KEY. Because txServiceUrl does not point at api.safe.global,
 * SafeApiKit does not require an apiKey here — the JWT never reaches the browser.
 */
export function getApiKit(chainId: number = 999): SafeApiKit {
  const existing = kits.get(chainId)
  if (existing) return existing

  const txServiceUrl = `${getOrigin()}/api/safe/${chainId}`
  const kit = new SafeApiKit({ chainId: BigInt(chainId), txServiceUrl })
  kits.set(chainId, kit)
  return kit
}
