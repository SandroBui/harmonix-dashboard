import { NextRequest } from 'next/server'
import { getWithdrawalsWindow } from '@/lib/vault-reader'
import { resolveVaultFromParams } from '@/lib/resolve-vault'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const config = resolveVaultFromParams(sp)

  try {
    const result = await getWithdrawalsWindow(config, {
      fromId: sp.from ? BigInt(sp.from) : undefined,
      toId: sp.to ? BigInt(sp.to) : undefined,
      sinceTs: sp.sinceTs ? Number(sp.sinceTs) : undefined,
      untilTs: sp.untilTs ? Number(sp.untilTs) : undefined,
    })
    return Response.json(result)
  } catch (err) {
    console.error('[api/withdrawals] fetch failed', err)
    return Response.json({ error: 'Failed to fetch withdrawals' }, { status: 500 })
  }
}
