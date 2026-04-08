import SafeApiKit from '@safe-global/api-kit'
import { getDefaultSafeAddress } from './roles'

let _apiKit: SafeApiKit | null = null

/**
 * Returns a singleton SafeApiKit instance for HyperEVM (chain 999).
 * api.safe.global always requires an API key — set NEXT_PUBLIC_SAFE_API_KEY.
 * Get one free at https://developer.safe.global
 */
export function getApiKit(): SafeApiKit {
  if (_apiKit) return _apiKit
  const apiKey = process.env.NEXT_PUBLIC_SAFE_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_SAFE_API_KEY is not set. Get a free key at https://developer.safe.global')
  _apiKit = new SafeApiKit({ chainId: 999n, apiKey })
  return _apiKit
}

/** @deprecated Use `getSafeAddressForRole(role)` or `getDefaultSafeAddress()` from roles.ts */
export function getSafeAddress(): `0x${string}` {
  return getDefaultSafeAddress()
}
