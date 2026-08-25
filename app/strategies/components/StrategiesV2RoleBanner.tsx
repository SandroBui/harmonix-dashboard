import Link from 'next/link'
import { truncateAddress } from '@/lib/format'
import CopyButton from '@/app/components/CopyButton'

type Props = {
  isConnected: boolean
  walletHasOperator: boolean
  operatorSafe: string
  operatorSafeHasRole: boolean
}

function isConfiguredAddress(addr: string) {
  return addr && addr.toLowerCase() !== '0x0000000000000000000000000000000000000000'
}

export default function StrategiesV2RoleBanner({
  isConnected,
  walletHasOperator,
  operatorSafe,
  operatorSafeHasRole,
}: Props) {
  const operatorLabel = isConfiguredAddress(operatorSafe)
    ? truncateAddress(operatorSafe)
    : 'not configured'

  if (!isConnected) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
        Connect your wallet to run strategy actions via EOA or Safe proposal.
      </div>
    )
  }

  const eoaOperator = walletHasOperator
  const safeOperator = operatorSafeHasRole
  const canOperatorAny = eoaOperator || safeOperator
  const fullyCovered = eoaOperator && safeOperator
  const walletOnlyOperator = eoaOperator && !safeOperator

  if (!canOperatorAny) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        Neither your wallet nor configured Safes hold{' '}
        <span className="font-medium">OPERATOR_ROLE</span> on the balance contract. Grant roles on
        the{' '}
        <Link href="/admin/roles" className="font-medium underline hover:no-underline">
          Roles
        </Link>{' '}
        page first.
      </div>
    )
  }

  const containerClass = fullyCovered
    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
    : walletOnlyOperator
      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
      : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${containerClass}`}>
      <p className="font-medium">Balance contract roles</p>
      <ul className="mt-2 space-y-1.5">
        <li>
          <span className="font-medium">Transfer / Approve / Acquire</span> need{' '}
          <span className="font-medium">OPERATOR_ROLE</span>:
          <span className="mt-0.5 block text-[13px]">
            {eoaOperator ? '✓ Your wallet' : '✗ Your wallet'}
            {isConfiguredAddress(operatorSafe) && (
              <>
                {' · '}
                {safeOperator ? '✓' : '✗'} Operator Safe{' '}
                <span className="font-mono">{operatorLabel}</span>
                <CopyButton value={operatorSafe} />
              </>
            )}
          </span>
        </li>
      </ul>

      {walletOnlyOperator && (
        <p className="mt-2 text-xs opacity-90">
          Your wallet has <span className="font-medium">OPERATOR_ROLE</span> but the Operator Safe
          does not. Use <span className="font-medium">Connected wallet (EOA)</span> for Transfer,
          Approve, or Acquire, or grant <span className="font-medium">OPERATOR_ROLE</span> to the
          Safe on the{' '}
          <Link href="/admin/roles" className="font-medium underline hover:no-underline">
            Roles
          </Link>{' '}
          page.
        </p>
      )}

      {fullyCovered && (
        <p className="mt-2 text-xs opacity-90">
          Wallet and configured Safes hold the required roles — EOA and Safe propose are both
          available.
        </p>
      )}
    </div>
  )
}
