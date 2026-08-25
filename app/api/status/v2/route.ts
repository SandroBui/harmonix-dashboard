import { NextResponse } from 'next/server'
import { getFundStatusV2 } from '@/lib/status-v2-reader'
import { getVaultGroupOrDefault } from '@/lib/vaults.config'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const vaultSlug = searchParams.get('vault')
  const config = getVaultGroupOrDefault(vaultSlug)

  if (config.version !== 2) {
    return NextResponse.json(
      { error: 'This API route only supports v2 vaults' },
      { status: 400 },
    )
  }

  try {
    const status = await getFundStatusV2(config)

    return NextResponse.json({
      status,
      vaultName: config.name,
      vaultSlug: config.slug,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
