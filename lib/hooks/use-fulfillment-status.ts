'use client'

import { useState, useEffect } from 'react'

function formatDuration(diffSeconds: number): string {
  if (diffSeconds < 60) return `${diffSeconds}s`
  if (diffSeconds < 3600) {
    const m = Math.floor(diffSeconds / 60)
    const s = diffSeconds % 60
    return s ? `${m}m ${s}s` : `${m}m`
  }
  if (diffSeconds < 86400) {
    const h = Math.floor(diffSeconds / 3600)
    const m = Math.floor((diffSeconds % 3600) / 60)
    return m ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(diffSeconds / 86400)
  const h = Math.floor((diffSeconds % 86400) / 3600)
  return h ? `${d}d ${h}h` : `${d}d`
}

export type FulfillmentStatus = {
  label: string | null
  overdue: boolean
}

/**
 * Returns a live ticking label describing time-left-to-fulfill (or overdue-by)
 * for a withdrawal request. Returns null label when the request is considered
 * done (fulfilled or already claimed), so callers can skip rendering the suffix.
 *
 * - `requestedAt` and `fulfillmentSeconds` are both in **seconds**.
 * - Ticks every 30s — withdrawals are day-scale, sub-minute precision is noise.
 */
export function useFulfillmentStatus(
  requestedAt: number,
  fulfillmentSeconds: number,
  isDone: boolean,
): FulfillmentStatus {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (isDone) return
    const id = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, 30_000)
    return () => clearInterval(id)
  }, [isDone])

  if (isDone) return { label: null, overdue: false }
  if (!requestedAt || fulfillmentSeconds <= 0) return { label: null, overdue: false }

  const deadline = requestedAt + fulfillmentSeconds
  const diff = deadline - now

  if (diff <= 0) {
    return { label: `Overdue ${formatDuration(-diff)}`, overdue: true }
  }
  return { label: formatDuration(diff), overdue: false }
}
