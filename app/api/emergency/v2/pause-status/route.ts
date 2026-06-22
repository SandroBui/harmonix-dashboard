import { NextResponse } from 'next/server'
import { getEmergencyV2PauseStatus } from '@/lib/emergency-v2-reader'
import { getVaultGroupOrDefault } from '@/lib/vaults.config'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const vaultSlug = searchParams.get('vault')
  const bypassCache = searchParams.get('bypassCache') === '1'
  const config = getVaultGroupOrDefault(vaultSlug)

  if (config.version !== 2) {
    return NextResponse.json(
      { error: 'This API route only supports v2 vaults' },
      { status: 400 },
    )
  }

  try {
    const pauseStatus = await getEmergencyV2PauseStatus(config, { bypassCache })
    return NextResponse.json(pauseStatus)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
