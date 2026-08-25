/**
 * Shared formatting utilities for token amounts, denominations, and addresses.
 * Centralises the formatUnits/truncateAddress helpers that were previously
 * duplicated across WithdrawalsClient and FulfillPanel.
 */

/**
 * Format a raw bigint string (as returned by contracts) using the given
 * decimal precision. Returns a locale-formatted string.
 *
 * @param value    Raw integer string (e.g. "1000000" for 1 USDT with 6 decimals)
 * @param decimals Token decimal places (e.g. 6 for USDT, 18 for DAI)
 * @param maxFrac  Maximum fractional digits to show (default 4)
 */
export function formatTokenAmount(
  value: string,
  decimals: number,
  maxFrac = 4,
): string {
  const bn = BigInt(value)
  if (bn === 0n) return '0'
  const divisor = 10n ** BigInt(decimals)
  const whole = bn / divisor
  const frac = bn % divisor
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '')
    .slice(0, maxFrac)
  return `${whole.toLocaleString()}.${fracStr}`
}

/**
 * Format a denomination amount (1e18 scale, USD-pegged) with a $ prefix.
 *
 * @param value   Raw integer string at 1e18 scale
 * @param maxFrac Maximum fractional digits (default 2)
 */
export function formatDenomination(value: string, maxFrac = 2): string {
  return `$${formatTokenAmount(value, 18, maxFrac)}`
}

/**
 * Truncate an Ethereum address to the form 0x1234…5678.
 */
/**
 * v2 vault fee rates from getVaultSetting: whole-number percent (1 = 1%, 10 = 10%).
 */
export function formatV2FeeRatePercent(value: string): string {
  if (!value || value === '0') return '0%'
  return `${value}%`
}

/** Basis points to percent string (500 bps → 5%). Zero means no limit. */
export function formatBpsPercent(bps: string): string {
  if (!bps || bps === '0') return 'No limit'
  const pct = Number(bps) / 100
  return `${pct.toFixed(2).replace(/\.00$/, '')}%`
}

/** Human-readable duration from seconds (e.g. 90061 → 1d 1h 1m 1s). */
export function formatDurationSeconds(seconds: number | string): string {
  const total = typeof seconds === 'string' ? Number(seconds) : seconds
  if (!Number.isFinite(total) || total === 0) return '0s'
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
