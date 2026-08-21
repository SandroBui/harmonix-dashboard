import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

export const hyperEvmMainnet = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
  },
})

export const wagmiConfig = createConfig({
  chains: [hyperEvmMainnet],
  connectors: [injected()],
  transports: { [hyperEvmMainnet.id]: http() },
  ssr: true,
})
