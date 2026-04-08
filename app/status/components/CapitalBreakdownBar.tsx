type Props = {
  idle: bigint
  claimable: bigint
  pending: bigint
  fundNav: bigint
}

export default function CapitalBreakdownBar({ idle, claimable, pending, fundNav }: Props) {
  const total = idle + claimable + pending + fundNav
  if (total === 0n) {
    return (
      <p className="text-xs text-neutral-400 dark:text-neutral-500">No capital tracked</p>
    )
  }

  const basisPoints  = 10_000n
  const idleBps      = (idle     * basisPoints) / total
  const claimBps     = (claimable * basisPoints) / total
  const pendingBps   = (pending  * basisPoints) / total
  const fundNavBps   = basisPoints - idleBps - claimBps - pendingBps

  const pctIdle      = Number(idleBps)    / 100
  const pctClaimable = Number(claimBps)   / 100
  const pctPending   = Number(pendingBps) / 100
  const pctFundNav   = Number(fundNavBps) / 100

  return (
    <div className="space-y-1.5">
      {/* Bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className="bg-emerald-500 transition-all"
          style={{ width: `${pctIdle}%` }}
          title={`Idle: ${pctIdle.toFixed(1)}%`}
        />
        <div
          className="bg-blue-500 transition-all"
          style={{ width: `${pctClaimable}%` }}
          title={`Claimable: ${pctClaimable.toFixed(1)}%`}
        />
        <div
          className="bg-yellow-400 transition-all"
          style={{ width: `${pctPending}%` }}
          title={`Pending: ${pctPending.toFixed(1)}%`}
        />
        <div
          className="bg-violet-500 transition-all"
          style={{ width: `${pctFundNav}%` }}
          title={`Fund NAV: ${pctFundNav.toFixed(1)}%`}
        />
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          Idle {pctIdle.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          Claimable {pctClaimable.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-yellow-400" />
          Pending {pctPending.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-violet-500" />
          Fund NAV {pctFundNav.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
