'use client'

import { useState, useEffect } from 'react'

function formatCountdown(diffSeconds: number): string {
  if (diffSeconds <= 0) return 'Ready'
  if (diffSeconds < 60) return `${diffSeconds}s`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ${diffSeconds % 60}s`
  const h = Math.floor(diffSeconds / 3600)
  const m = Math.floor((diffSeconds % 3600) / 60)
  return `${h}h ${m}m`
}

/**
 * Returns a live ticking countdown string from a Unix timestamp (seconds).
 * Returns null when no timestamp is provided or timestamp is 0.
 * Returns 'Ready' when the timestamp has passed.
 */
export function useCountdown(executableAtSeconds: number | undefined): string | null {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const isReady = !executableAtSeconds || executableAtSeconds === 0 || now >= executableAtSeconds

  useEffect(() => {
    if (isReady) return

    const id = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [isReady])

  if (!executableAtSeconds || executableAtSeconds === 0) return null

  const diff = executableAtSeconds - now
  return formatCountdown(diff)
}
