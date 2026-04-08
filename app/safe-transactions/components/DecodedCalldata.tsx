'use client'

import type { DataDecoded, DecodedParam } from '@/lib/safe/types'
import { ASSET_METADATA } from '@/lib/contracts'
import { decodeSubmitInnerData } from '@/lib/safe/decoder'

type Props = {
  decoded: DataDecoded | null
  rawData: string | null
  to: string
}

export default function DecodedCalldata({ decoded, rawData, to }: Props) {
  if (!decoded) {
    return (
      <div className="rounded-md bg-neutral-100 p-3 dark:bg-neutral-800">
        <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Raw Calldata</p>
        <code className="break-all font-mono text-xs text-neutral-600 dark:text-neutral-300">
          {rawData ?? '0x (no data)'}
        </code>
      </div>
    )
  }

  const isSubmitOrRevoke = decoded.method === 'submit' || decoded.method === 'revoke'
  const innerDecoded = isSubmitOrRevoke
    ? decodeSubmitInnerData(decoded.parameters.find((p) => p.name === 'data')?.value ?? '')
    : null

  return (
    <div className="rounded-md bg-neutral-100 p-3 dark:bg-neutral-800">
      {/* Function name */}
      <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-white">
        {decoded.method}
        <span className="ml-1 text-neutral-400">()</span>
      </p>

      {/* Parameters */}
      <div className="space-y-1.5">
        {decoded.parameters.map((param, i) => {
          if (isSubmitOrRevoke && param.name === 'data' && innerDecoded) {
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="w-32 shrink-0 text-neutral-500 dark:text-neutral-400">
                  {param.name}
                  <span className="ml-1 text-neutral-400 dark:text-neutral-500">({param.type})</span>
                </span>
                <div className="min-w-0 flex-1 rounded border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-900">
                  <p className="mb-1 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    {innerDecoded.method}
                    <span className="ml-1 text-neutral-400">()</span>
                  </p>
                  {innerDecoded.parameters.map((inner, j) => (
                    <div key={j} className="flex items-start gap-2 text-xs">
                      <span className="w-28 shrink-0 text-neutral-500 dark:text-neutral-400">
                        {inner.name}
                        <span className="ml-1 text-neutral-400 dark:text-neutral-500">({inner.type})</span>
                      </span>
                      <span className="break-all font-mono text-neutral-700 dark:text-neutral-300">
                        {formatParamValue(inner.value, inner.type, to, innerDecoded.parameters)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="w-32 shrink-0 text-neutral-500 dark:text-neutral-400">
                {param.name}
                <span className="ml-1 text-neutral-400 dark:text-neutral-500">({param.type})</span>
              </span>
              <span className="break-all font-mono text-neutral-700 dark:text-neutral-300">
                {formatParamValue(param.value, param.type, to, decoded.parameters)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatParamValue(value: string, type: string, to: string, allParams: DecodedParam[]): string {
  if (type === 'uint256') {
    // Primary lookup: `to` address is the token contract (e.g. ERC-20 transfer/approve)
    let meta = ASSET_METADATA[to.toLowerCase()]

    // Secondary lookup: for FundNavFeed calls, the NAV amount is denominated in the
    // sibling `asset` parameter, not in the contract being called (`to`).
    if (!meta) {
      const assetAddr = allParams.find((p) => p.name === 'asset')?.value ?? ''
      meta = ASSET_METADATA[assetAddr.toLowerCase()]
    }

    if (meta) {
      try {
        const bn = BigInt(value)
        const divisor = 10n ** BigInt(meta.decimals)
        const whole = bn / divisor
        const frac = bn % divisor
        if (frac === 0n) return `${whole.toLocaleString()} ${meta.symbol}`
        const fracStr = frac.toString().padStart(meta.decimals, '0').replace(/0+$/, '').slice(0, 4)
        return `${whole.toLocaleString()}.${fracStr} ${meta.symbol}`
      } catch {
        return value
      }
    }
  }

  if (type === 'address[]') {
    try {
      const addrs = JSON.parse(value) as string[]
      if (Array.isArray(addrs)) {
        return addrs
          .map((a) => `${a.slice(0, 6)}…${a.slice(-4)}`)
          .join(', ')
      }
    } catch { /* not JSON */ }
  }

  return value
}
