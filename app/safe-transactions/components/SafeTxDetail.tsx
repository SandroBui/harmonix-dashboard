'use client'

import type { PendingSafeTx, SafeInfo } from '@/lib/safe/types'
import DecodedCalldata from './DecodedCalldata'
import SafeTxActions from './SafeTxActions'

type Props = {
  tx: PendingSafeTx
  safeInfo: SafeInfo | undefined
  safeAddress: `0x${string}`
}

function truncate(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function SafeTxDetail({ tx, safeInfo, safeAddress }: Props) {
  return (
    <div className="space-y-4 border-t border-neutral-200 px-4 py-4 dark:border-neutral-700">
      {/* Decoded calldata */}
      <DecodedCalldata decoded={tx.dataDecoded} rawData={tx.data} to={tx.to} />

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <span className="text-neutral-500">To</span>
          <p className="mt-0.5 font-mono text-xs text-neutral-700 dark:text-neutral-300">{tx.to}</p>
        </div>
        <div>
          <span className="text-neutral-500">Value</span>
          <p className="mt-0.5 text-neutral-700 dark:text-neutral-300">
            {tx.value === '0' ? '0 ETH' : `${Number(BigInt(tx.value)) / 1e18} ETH`}
          </p>
        </div>
        <div>
          <span className="text-neutral-500">Operation</span>
          <p className="mt-0.5 text-neutral-700 dark:text-neutral-300">
            {tx.operation === 0 ? 'Call' : 'DelegateCall'}
          </p>
        </div>
        <div>
          <span className="text-neutral-500">Submitted</span>
          <p className="mt-0.5 text-neutral-700 dark:text-neutral-300">
            {new Date(tx.submissionDate).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Confirmation list */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-neutral-900 dark:text-white">
          Confirmations ({tx.confirmationsCount}/{tx.confirmationsRequired})
        </h4>
        <ul className="space-y-1">
          {/* Signed */}
          {tx.confirmations.map((conf) => (
            <li key={conf.owner} className="flex items-center gap-2 text-xs">
              <span className="text-green-500">✓</span>
              <code className="font-mono text-neutral-600 dark:text-neutral-300">{conf.owner}</code>
              <span className="text-neutral-400">
                {new Date(conf.submissionDate).toLocaleString()}
              </span>
            </li>
          ))}
          {/* Pending owners */}
          {safeInfo?.owners
            .filter((o) => !tx.confirmations.some((c) => c.owner.toLowerCase() === o.toLowerCase()))
            .map((owner) => (
              <li key={owner} className="flex items-center gap-2 text-xs">
                <span className="text-neutral-300 dark:text-neutral-600">○</span>
                <code className="font-mono text-neutral-400 dark:text-neutral-500">{owner}</code>
                <span className="text-neutral-400">pending</span>
              </li>
            ))}
        </ul>
      </div>

      {/* Safe tx hash */}
      <div className="text-xs text-neutral-400 dark:text-neutral-500">
        <span>Safe tx hash: </span>
        <code className="font-mono">{truncate(tx.safeTxHash)}</code>
      </div>

      {/* Actions */}
      <SafeTxActions tx={tx} safeInfo={safeInfo} safeAddress={safeAddress} />
    </div>
  )
}
