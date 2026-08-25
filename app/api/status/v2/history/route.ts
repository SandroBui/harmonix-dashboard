import { NextResponse } from 'next/server'
import { getActionHistory } from '@/lib/action-history-reader'
import { getVaultGroupOrDefault } from '@/lib/vaults.config'

function parseDaysParam(days: string | null): number {
  if (days === 'all') return 0
  const n = Number(days ?? 30)
  if (n === 7 || n === 30 || n === 90) return n
  return 30
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const vaultSlug = searchParams.get('vault')
  const days = parseDaysParam(searchParams.get('days'))
  const config = getVaultGroupOrDefault(vaultSlug)

  if (config.version !== 2) {
    return NextResponse.json(
      { error: 'This API route only supports v2 vaults' },
      { status: 400 },
    )
  }

  try {
    const history = await getActionHistory(config, { days })

    return NextResponse.json({
      history,
      vaultSlug: config.slug,
      days,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
