'use client'

import CopyButton from '@/app/components/CopyButton'
import {
  formatTokenAmount,
  formatV2FeeRatePercent,
  truncateAddress,
} from '@/lib/format'
import type { VaultConfigV2Data } from '@/lib/vault-config-v2-reader'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type Props = { data: VaultConfigV2Data }

type RowDef = {
  label: string
  display: string
  isAddress?: boolean
  copyValue?: string
}

function formatTimestamp(seconds: string): string {
  if (!seconds || seconds === '0') return 'Never'
  const ms = Number(seconds) * 1_000
  if (!Number.isFinite(ms) || ms <= 0) return 'Never'
  return new Date(ms).toLocaleString()
}

function AddressValue({ address }: { address: string }) {
  const isZero = address === ZERO_ADDRESS
  if (isZero) {
    return <span className="text-yellow-600 dark:text-yellow-400">not set</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm">
      {truncateAddress(address)}
      <CopyButton value={address} />
    </span>
  )
}

function ConfigSection({ title, rows }: { title: string; rows: RowDef[] }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-white">{title}</h2>
      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white px-5 dark:divide-neutral-800 dark:border-neutral-700 dark:bg-neutral-900">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{row.label}</span>
            {row.isAddress ? (
              <AddressValue address={row.copyValue ?? row.display} />
            ) : (
              <span className="text-sm font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                {row.display}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function VaultConfigV2Client({ data }: Props) {
  const addressRows: RowDef[] = [
    {
      label: 'Fund Contract',
      display: data.addresses.fundContract,
      isAddress: true,
      copyValue: data.addresses.fundContract,
    },
    {
      label: 'Fund Contract Reader',
      display: data.addresses.fundContractReader,
      isAddress: true,
      copyValue: data.addresses.fundContractReader,
    },
    {
      label: 'Balance Contract',
      display: data.addresses.balanceContract,
      isAddress: true,
      copyValue: data.addresses.balanceContract,
    },
    {
      label: 'Fund NAV Contract',
      display: data.addresses.fundNavContract,
      isAddress: true,
      copyValue: data.addresses.fundNavContract,
    },
    {
      label: 'Timelock',
      display: data.addresses.timelock,
      isAddress: true,
      copyValue: data.addresses.timelock,
    },
  ]

  const vaultConfigRows: RowDef[] = [
    {
      label: 'Minimum Supply',
      display: formatTokenAmount(data.vaultConfig.minimumSupply, 18, 6),
    },
    {
      label: 'Capacity',
      display: formatTokenAmount(data.vaultConfig.capacity, 18, 6),
    },
  ]

  const feeRows: RowDef[] = [
    {
      label: 'Management Fee Receiver',
      display: data.fees.managementFeeReceiver,
      isAddress: true,
      copyValue: data.fees.managementFeeReceiver,
    },
    {
      label: 'Management Fee Rate',
      display: formatV2FeeRatePercent(data.fees.managementFeeRate),
    },
    {
      label: 'Last Management Harvest',
      display: formatTimestamp(data.fees.lastManagementHarvest),
    },
    {
      label: 'Performance Fee Receiver',
      display: data.fees.performanceFeeReceiver,
      isAddress: true,
      copyValue: data.fees.performanceFeeReceiver,
    },
    {
      label: 'Performance Fee Rate',
      display: formatV2FeeRatePercent(data.fees.performanceFeeRate),
    },
    {
      label: 'Last Performance Harvest',
      display: formatTimestamp(data.fees.lastPerformanceHarvest),
    },
    {
      label: 'High Watermark (PPS)',
      display: formatTokenAmount(data.fees.highWatermark, 18, 6),
    },
  ]

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Vault Configuration</h1>

      <ConfigSection title="Contract Addresses" rows={addressRows} />
      <ConfigSection title="Vault Config" rows={vaultConfigRows} />
      <ConfigSection title="Fee Configuration" rows={feeRows} />

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Fee data read from HaVaultReader V2 (getVaultSetting / getVaultState). Last fetched{' '}
        {new Date(data.fetchedAt).toLocaleString()}.
      </p>
    </div>
  )
}
