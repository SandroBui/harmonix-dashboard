'use client'

import { Suspense, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wagmi-config'
import VaultProviderWrapper from './vault-provider-wrapper'

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const maybeStatus = (error as { status?: unknown }).status
  if (typeof maybeStatus === 'number') return maybeStatus

  const response = (error as { response?: { status?: unknown } }).response
  if (response && typeof response.status === 'number') return response.status

  const cause = (error as { cause?: { status?: unknown } }).cause
  if (cause && typeof cause.status === 'number') return cause.status

  const message = (error as { message?: unknown }).message
  if (typeof message === 'string') {
    const match = message.match(/\b(\d{3})\b/)
    if (match) return Number(match[1])
  }

  return undefined
}

function parseRetryAfterMs(error: unknown): number | null {
  const message = typeof (error as { message?: unknown })?.message === 'string'
    ? (error as { message: string }).message
    : ''
  const match = message.match(/retry-?after\s*[:=]?\s*(\d+)/i)
  if (!match) return null
  const seconds = Number(match[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return seconds * 1000
}

function jitteredExponentialDelay(attemptIndex: number): number {
  const base = Math.min(1000 * 2 ** attemptIndex, 30_000)
  const jitter = Math.floor(Math.random() * 500)
  return base + jitter
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (getErrorStatus(error) === 429) return failureCount < 5
          return failureCount < 3
        },
        retryDelay: (attemptIndex, error) => {
          const retryAfterMs = parseRetryAfterMs(error)
          if (retryAfterMs !== null) return retryAfterMs
          return jitteredExponentialDelay(attemptIndex)
        },
      },
    },
  }))
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
