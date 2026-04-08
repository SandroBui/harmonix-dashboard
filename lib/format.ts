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
export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
