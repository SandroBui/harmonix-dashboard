type Props = {
  idle: bigint
  claimable: bigint
  pending: bigint
  fundNav: bigint
  size?: number
  strokeWidth?: number
  centerPrimary?: string
  centerSecondary?: string
}

const SLICES = [
  { key: 'idle', color: '#10b981' },
  { key: 'claimable', color: '#3b82f6' },
  { key: 'pending', color: '#facc15' },
  { key: 'fundNav', color: '#8b5cf6' },
] as const

export default function CapitalDonut({
  idle,
  claimable,
  pending,
  fundNav,
  size = 72,
  strokeWidth = 12,
  centerPrimary,
  centerSecondary,
}: Props) {
  const total = idle + claimable + pending + fundNav
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2

  if (total === 0n) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="No capital">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-200 dark:text-neutral-800"
        />
      </svg>
    )
  }

  const basisPoints = 10_000n
  const valuesByKey = { idle, claimable, pending, fundNav } as const
  const bps = {
    idle: Number((idle * basisPoints) / total),
    claimable: Number((claimable * basisPoints) / total),
    pending: Number((pending * basisPoints) / total),
    fundNav: 0,
  }
  bps.fundNav = 10_000 - bps.idle - bps.claimable - bps.pending

  const ordered = [...SLICES].sort(
    (a, b) => Number(valuesByKey[b.key]) - Number(valuesByKey[a.key]),
  )

  const dominantKey = ordered[0].key
  const dominantPct = bps[dominantKey] / 100

  // Start arcs at 12 o'clock by offsetting a quarter-turn worth of dash.
  const startOffset = circumference / 4

  let consumed = 0
  const arcs = ordered
    .filter((s) => bps[s.key] > 0)
    .map((s) => {
      const fraction = bps[s.key] / 10_000
      const length = fraction * circumference
      const arc = (
        <circle
          key={s.key}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={s.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${length} ${circumference - length}`}
          strokeDashoffset={startOffset - consumed}
        />
      )
      consumed += length
      return arc
    })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${dominantKey} ${dominantPct}%`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-neutral-100 dark:text-neutral-800"
      />
      {arcs}
      {centerPrimary ? (
        <>
          <text
            x={cx}
            y={cy - (centerSecondary ? 6 : 0)}
            dy="0.35em"
            textAnchor="middle"
            className="fill-neutral-900 text-[15px] font-semibold tabular-nums dark:fill-white"
          >
            {centerPrimary}
          </text>
          {centerSecondary && (
            <text
              x={cx}
              y={cy + 14}
              dy="0.35em"
              textAnchor="middle"
              className="fill-neutral-400 text-[11px] tabular-nums dark:fill-neutral-500"
            >
              {centerSecondary}
            </text>
          )}
        </>
      ) : (
        <text
          x={cx}
          y={cy}
          dy="0.35em"
          textAnchor="middle"
          className="fill-neutral-900 text-[14px] font-semibold tabular-nums dark:fill-white"
        >
          {dominantPct.toFixed(0)}%
        </text>
      )}
    </svg>
  )
}
