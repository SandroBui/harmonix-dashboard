'use client'

// Reads TokenInfo from HyperEVM's on-chain precompile and exposes a conversion
// helper that mirrors HLConversions.evmToWei() from hyper-evm-lib.
//
// Precompile address: 0x000000000000000000000000000000000000080C
// Input:  abi.encode(uint64 tokenIndex)
// Output: abi.encode(TokenInfo struct)
//
// TokenInfo layout (from PrecompileLib.sol):
//   string name
//   uint64[] spots
//   uint64 deployerTradingFeeShare
//   address deployer
//   address evmContract
//   uint8 szDecimals
//   uint8 weiDecimals
//   int8 evmExtraWeiDecimals

import { encodeAbiParameters, decodeAbiParameters } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { getPublicClient } from '@/lib/client'

const TOKEN_INFO_PRECOMPILE = '0x000000000000000000000000000000000000080C' as const

const TOKEN_INFO_ABI_PARAMS = [
  {
    type: 'tuple',
    components: [
      { name: 'name', type: 'string' },
      { name: 'spots', type: 'uint64[]' },
      { name: 'deployerTradingFeeShare', type: 'uint64' },
      { name: 'deployer', type: 'address' },
      { name: 'evmContract', type: 'address' },
      { name: 'szDecimals', type: 'uint8' },
      { name: 'weiDecimals', type: 'uint8' },
      { name: 'evmExtraWeiDecimals', type: 'int8' },
    ],
  },
] as const

export type TokenInfo = {
  name: string
  evmContract: `0x${string}`
  szDecimals: number
  weiDecimals: number
  evmExtraWeiDecimals: number
}

// In-memory cache keyed by tokenIndex — evmExtraWeiDecimals is static per token.
const tokenInfoCache = new Map<bigint, TokenInfo>()

export async function fetchTokenInfo(tokenIndex: bigint): Promise<TokenInfo> {
  const cached = tokenInfoCache.get(tokenIndex)
  if (cached) return cached

  const publicClient = getPublicClient()
  const callData = encodeAbiParameters(
    [{ type: 'uint64' }],
    [tokenIndex],
  )

  const result = await publicClient.call({
    to: TOKEN_INFO_PRECOMPILE,
    data: callData,
  })

  if (!result.data) throw new Error('TokenInfo precompile returned empty data')

  const [decoded] = decodeAbiParameters(TOKEN_INFO_ABI_PARAMS, result.data)

  const info: TokenInfo = {
    name: decoded.name,
    evmContract: decoded.evmContract as `0x${string}`,
    szDecimals: decoded.szDecimals,
    weiDecimals: decoded.weiDecimals,
    // int8 comes back as a number in viem
    evmExtraWeiDecimals: Number(decoded.evmExtraWeiDecimals),
  }

  tokenInfoCache.set(tokenIndex, info)
  return info
}

/**
 * Mirrors HLConversions.evmToWei(uint64 token, uint256 evmAmount).
 * Must be called after fetchTokenInfo has resolved.
 *
 * evmExtraWeiDecimals = evmDecimals - weiDecimals
 *   > 0 → EVM has more decimals: divide to get wei
 *   < 0 → EVM has fewer decimals: multiply to get wei
 *   = 0 → 1:1 mapping
 */
export function evmToWei(info: TokenInfo, evmAmount: bigint): bigint {
  const n = info.evmExtraWeiDecimals
  if (n === 0) return evmAmount
  if (n > 0) return evmAmount / 10n ** BigInt(n)
  return evmAmount * 10n ** BigInt(-n)
}

export function useTokenInfo(tokenIndex: bigint | undefined) {
  return useQuery({
    queryKey: ['hypercore', 'tokenInfo', tokenIndex?.toString()],
    queryFn: () => fetchTokenInfo(tokenIndex!),
    enabled: tokenIndex !== undefined,
    staleTime: Infinity, // token metadata is static
    retry: 2,
  })
}
