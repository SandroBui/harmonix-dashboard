import Link from 'next/link'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'

type RoleRow = {
  label: string
  roleName: string
  walletHasRole: boolean
  safeHasRole: boolean
  safeAddress: string
  safeLabel: string
}

type Props = {
  isConnected: boolean
  syncRole: RoleRow
  updateRole: RoleRow
  harvestRole: RoleRow
}

function isConfiguredAddress(addr: string) {
  return addr && addr.toLowerCase() !== '0x0000000000000000000000000000000000000000'
}

export default function NavV2RoleBanner({ isConnected, syncRole, updateRole, harvestRole }: Props) {
  if (!isConnected) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
        Connect your wallet to sync Perp DEX balance and update NAV via EOA or Safe proposal.
      </div>
    )
  }

  const canSyncAny = syncRole.walletHasRole || syncRole.safeHasRole
  const canUpdateAny = updateRole.walletHasRole || updateRole.safeHasRole
  const canHarvestAny = harvestRole.walletHasRole || harvestRole.safeHasRole

  if (!canSyncAny && !canUpdateAny && !canHarvestAny) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        Neither your wallet nor configured Safes hold the required roles (
        <span className="font-medium">ADMIN</span> on Perp NAV,{' '}
        <span className="font-medium">ADMIN</span> on fund for harvest). Grant roles on the{' '}
        <Link href="/admin/roles" className="font-medium underline hover:no-underline">
          Roles
        </Link>{' '}
        page first.
      </div>
    )
  }

  const fullyCovered =
    syncRole.walletHasRole &&
    syncRole.safeHasRole &&
    updateRole.walletHasRole &&
    updateRole.safeHasRole &&
    harvestRole.walletHasRole &&
    harvestRole.safeHasRole

  const containerClass = fullyCovered
    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
    : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'

  function RoleStatus({ row }: { row: RoleRow }) {
    const safeLabel = isConfiguredAddress(row.safeAddress)
      ? truncateAddress(row.safeAddress)
      : 'not configured'

    return (
      <span className="mt-0.5 block text-[13px]">
        {row.walletHasRole ? '✓ Your wallet' : '✗ Your wallet'}
        {isConfiguredAddress(row.safeAddress) && (
          <>
            {' · '}
            {row.safeHasRole ? '✓' : '✗'} {row.safeLabel}{' '}
            <span className="font-mono">{safeLabel}</span>
            <CopyButton value={row.safeAddress} />
          </>
        )}
      </span>
    )
  }

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${containerClass}`}>
      <p className="font-medium">NAV workflow roles</p>
      <ul className="mt-2 space-y-1.5">
        <li>
          <span className="font-medium">Step 1 — syncPerpDexBalance()</span> on Perp NAV contract
          needs <span className="font-medium">{syncRole.roleName}</span>:
          <RoleStatus row={syncRole} />
        </li>
        <li>
          <span className="font-medium">Step 2 — updateNav()</span> on fund contract needs{' '}
          <span className="font-medium">{updateRole.roleName}</span>:
          <RoleStatus row={updateRole} />
        </li>
        <li>
          <span className="font-medium">Steps 3–4 — harvest*Fee()</span> on fund contract need{' '}
          <span className="font-medium">{harvestRole.roleName}</span>:
          <RoleStatus row={harvestRole} />
        </li>
      </ul>
      {fullyCovered && (
        <p className="mt-2 text-xs opacity-90">
          Wallet and configured Safes hold the required roles — EOA and Safe propose are available
          for all steps.
        </p>
      )}
    </div>
  )
}
