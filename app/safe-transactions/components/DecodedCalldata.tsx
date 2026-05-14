'use client'

import type { DataDecoded } from '@/lib/safe/types'
import type { AssetMeta } from '@/lib/vault-group-config'
import { useAssetMetadata } from '@/lib/hooks/use-asset-metadata'
import { decodeSubmitInnerData, decodeUpgradeInnerData, resolveSelector } from '@/lib/safe/decoder'
import { formatDenomination } from '@/lib/format'

type Props = {
  decoded: DataDecoded | null
  rawData: string | null
  to: string
}

export default function DecodedCalldata({ decoded, rawData, to }: Props) {
  const { data: assetMetadata } = useAssetMetadata()

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
  const isSchedule = decoded.method === 'schedule'
  const isExecute = decoded.method === 'execute'
  const innerParamName = isSubmitOrRevoke || isSchedule ? 'data' : isExecute ? 'payload' : null
  const innerDecoded = isSubmitOrRevoke
    ? decodeSubmitInnerData(decoded.parameters.find((p) => p.name === 'data')?.value ?? '')
    : (isSchedule || isExecute) && innerParamName
    ? decodeUpgradeInnerData(decoded.parameters.find((p) => p.name === innerParamName)?.value ?? '')
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
          // multiSend: replace the raw `transactions` bytes blob with a list
          // of decoded inner calls so reviewers can see each step.
          if (decoded.method === 'multiSend' && param.name === 'transactions' && decoded.multiSendInner) {
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="w-32 shrink-0 break-words text-neutral-500 dark:text-neutral-400">
                  {param.name}
                  <span className="ml-1 text-neutral-400 dark:text-neutral-500">({decoded.multiSendInner.length} calls)</span>
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  {decoded.multiSendInner.map((call, k) => (
                    <div
                      key={k}
                      className="rounded border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">#{k + 1}</span>
                        <span className="text-neutral-800 dark:text-neutral-100">
                          {call.decoded?.method ?? '(unknown)'}
                          <span className="ml-1 text-neutral-400">()</span>
                        </span>
                        <span className="text-neutral-400 dark:text-neutral-500">
                          {call.operation === 1 ? 'DelegateCall' : 'Call'} → {call.to.slice(0, 6)}…{call.to.slice(-4)}
                        </span>
                        {call.value !== '0' && (
                          <span className="text-neutral-400 dark:text-neutral-500">value {call.value}</span>
                        )}
                      </div>
                      {call.decoded ? (
                        <div className="space-y-1">
                          {call.decoded.parameters.map((inner, j) => (
                            <div key={j} className="flex items-start gap-2 text-xs">
                              <span className="w-28 shrink-0 break-words text-neutral-500 dark:text-neutral-400">
                                {inner.name}
                                <span className="ml-1 text-neutral-400 dark:text-neutral-500">({inner.type})</span>
                              </span>
                              <span className="min-w-0 flex-1 break-all font-mono text-neutral-700 dark:text-neutral-300">
                                {formatParamValue(inner.value, inner.name, inner.type, call.to, assetMetadata)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <code className="block break-all font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                          {call.data}
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          if (innerParamName && param.name === innerParamName && innerDecoded) {
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="w-32 shrink-0 break-words text-neutral-500 dark:text-neutral-400">
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
                      <span className="w-28 shrink-0 break-words text-neutral-500 dark:text-neutral-400">
                        {inner.name}
                        <span className="ml-1 text-neutral-400 dark:text-neutral-500">({inner.type})</span>
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono text-neutral-700 dark:text-neutral-300">
                        {formatParamValue(inner.value, inner.name, inner.type, to, assetMetadata)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="w-32 shrink-0 break-words text-neutral-500 dark:text-neutral-400">
                {param.name}
                <span className="ml-1 text-neutral-400 dark:text-neutral-500">({param.type})</span>
              </span>
              <span className="min-w-0 flex-1 break-all font-mono text-neutral-700 dark:text-neutral-300">
                {formatParamValue(param.value, param.name, param.type, to, assetMetadata)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatParamValue(value: string, paramName: string, type: string, to: string, assetMetadata?: Record<string, AssetMeta>): string {
  if (type === 'bytes4') {
    const fnName = resolveSelector(value)
    if (fnName !== value) return `${value} (${fnName})`
    return value
  }

  if (type === 'uint256') {
    // FundNavFeed `nav` (syncNavValue) is a USD denomination at 1e18 scale —
    // NOT a token amount in the sibling `asset`. Format it as a denomination.
    if (paramName === 'nav') {
      try {
        return formatDenomination(value, 6)
      } catch {
        return value
      }
    }

    // `to` address is the token contract (e.g. ERC-20 transfer/approve).
    const meta = assetMetadata?.[to.toLowerCase()]

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
