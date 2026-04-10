'use client'

import { Suspense, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wagmi-config'
import VaultProviderWrapper from './vault-provider-wrapper'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <VaultProviderWrapper>{children}</VaultProviderWrapper>
        </Suspense>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
