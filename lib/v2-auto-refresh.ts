export const V2_AUTO_REFRESH_MS = 3 * 60_000

export function formatV2AutoRefreshLabel(ms = V2_AUTO_REFRESH_MS): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000}m`
  return `${ms / 1_000}s`
}

export function formatUpdatedAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}
