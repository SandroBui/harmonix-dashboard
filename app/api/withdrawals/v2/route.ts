import { NextResponse } from 'next/server'
import { getWithdrawalsV2, parseWithdrawalsDaysParam } from '@/lib/withdrawals-v2-reader'
import { getVaultGroupOrDefault } from '@/lib/vaults.config'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const vaultSlug = searchParams.get('vault')
  const days = parseWithdrawalsDaysParam(searchParams.get('days'))
  const config = getVaultGroupOrDefault(vaultSlug)

  if (config.version !== 2) {
    return NextResponse.json(
      { error: 'This API route only supports v2 vaults' },
      { status: 400 },
    )
  }

  const data = await getWithdrawalsV2(config, { days })

  return NextResponse.json({
    data,
    vaultSlug: config.slug,
    days,
  })
}
