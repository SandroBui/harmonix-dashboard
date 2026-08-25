'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import type { VaultSafeOption } from '@/lib/safe/vault-safes'
import type { SafeSelection } from './SafeWalletSelect'

const STORAGE_PREFIX = 'harmonix:safe-transactions:safe'

/** Index alone is not enough — config order may change between visits. */
type StoredSelection = { index: number; address: string }

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode / quota) — selection just won't persist.
  }
  for (const listener of listeners) listener()
}

function parseSelection(raw: string | null, options: VaultSafeOption[]): SafeSelection | null {
  const fallback = options.length > 0 ? 0 : null
  if (!raw) return fallback
  let stored: StoredSelection
  try {
    stored = JSON.parse(raw) as StoredSelection
  } catch {
    return fallback
  }
  const address = stored.address?.toLowerCase()
  if (!address) return fallback
  if (options[stored.index]?.address.toLowerCase() === address) return stored.index
  const moved = options.findIndex((option) => option.address.toLowerCase() === address)
  return moved >= 0 ? moved : fallback
}

/**
 * Remembers the picked Safe per vault so a reload lands on the same one, falling
 * back to the first configured Safe (`null` when the vault has none).
 *
 * Stored values are read through `useSyncExternalStore` so the server render and
 * hydration both start from that fallback. The in-session override keeps the
 * dropdown working even when localStorage writes are rejected.
 */
export function useSafeSelection(
  vaultSlug: string,
  options: VaultSafeOption[],
): [SafeSelection | null, (value: SafeSelection) => void] {
  const key = `${STORAGE_PREFIX}:${vaultSlug}`
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )
  const [override, setOverride] = useState<{ slug: string; value: SafeSelection } | null>(null)

  const selection =
    override?.slug === vaultSlug ? override.value : parseSelection(raw, options)

  const setSelection = useCallback(
    (value: SafeSelection) => {
      setOverride({ slug: vaultSlug, value })
      const option = options[value]
      if (!option) return
      write(key, JSON.stringify({ index: value, address: option.address } satisfies StoredSelection))
    },
    [key, options, vaultSlug],
  )

  return [selection, setSelection]
}
