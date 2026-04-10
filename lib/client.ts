import { createPublicClient, http } from 'viem'
import { hyperEvmMainnet } from './wagmi-config'

/**
 * Returns a viem public client for HyperEVM.
 * All vault groups currently live on HyperEVM (chainId 999).
 */
export function getPublicClient() {
  return createPublicClient({
    chain: hyperEvmMainnet,
    transport: http(),
  })
}
