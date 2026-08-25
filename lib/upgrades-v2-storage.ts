const STORAGE_PREFIX = 'upgrades-v2-ops:'

export type StoredUpgradeOp = {
  id: `0x${string}`
  target: `0x${string}`
  value: string
  data: `0x${string}`
  predecessor: `0x${string}`
  salt: `0x${string}`
  delay: string
  savedAt: number
}

function storageKey(slug: string) {
  return `${STORAGE_PREFIX}${slug}`
}

export function readStoredUpgradeOps(slug: string): StoredUpgradeOp[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(slug))
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredUpgradeOp[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveStoredUpgradeOp(slug: string, op: StoredUpgradeOp) {
  if (typeof window === 'undefined') return
  const existing = readStoredUpgradeOps(slug)
  const filtered = existing.filter((e) => e.id.toLowerCase() !== op.id.toLowerCase())
  filtered.push(op)
  localStorage.setItem(storageKey(slug), JSON.stringify(filtered))
}

export function storedIds(slug: string): `0x${string}`[] {
  return readStoredUpgradeOps(slug).map((o) => o.id)
}

export function removeStoredUpgradeOp(slug: string, id: `0x${string}`) {
  if (typeof window === 'undefined') return
  const existing = readStoredUpgradeOps(slug)
  const filtered = existing.filter((e) => e.id.toLowerCase() !== id.toLowerCase())
  if (filtered.length === existing.length) return
  localStorage.setItem(storageKey(slug), JSON.stringify(filtered))
}
