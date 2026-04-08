import type { VaultOverviewData } from '@/lib/status-reader'
import { truncateAddress } from '@/lib/format'

type Props = { vaults: VaultOverviewData[] }

export default function PausedVaultAlert({ vaults }: Props) {
  const paused = vaults.filter((v) => v.isPaused)
  if (paused.length === 0) return null

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-lg leading-none text-red-500">⚠</span>
        <div className="text-sm text-red-700 dark:text-red-400">
          <p className="font-semibold">
            {paused.length === 1
              ? '1 vault is currently paused'
              : `${paused.length} vaults are currently paused`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {paused.map((v) => (
              <li key={v.vault} className="flex items-center gap-2">
                <span className="font-medium">{v.symbol} Vault</span>
                <span className="font-mono text-xs opacity-70">{truncateAddress(v.vault)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
