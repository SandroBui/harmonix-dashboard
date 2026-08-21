import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DECODE_PATH = '/api/v1/transactions/decode'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function getDecodeApiBase(): string | null {
  const raw = process.env.TRANSACTION_DECODE_API_BASE_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

function parseChainId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Server proxy to the Harmonix transaction decode API.
 *
 * Upstream contract:
 * `{ chain_id, from, to, data, value }`
 *
 * The browser never sees TRANSACTION_DECODE_API_BASE_URL. When the env is
 * unset the handler returns 503 so the client decoder can fall back to the
 * Safe Transaction Service / local ABI path.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const base = getDecodeApiBase()
  if (!base) {
    return Response.json(
      { error: 'TRANSACTION_DECODE_API_BASE_URL is not configured' },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  // `data: "0x"` is valid (value transfer) — only reject when the field is absent.
  const data = asString(input.data)
  const to = asString(input.to)
  const from = asString(input.from) ?? ZERO_ADDRESS
  const value = asString(input.value) ?? '0'
  const chainId = parseChainId(input.chain_id) ?? parseChainId(input.chainId)

  if (data === null || !to) {
    return Response.json({ error: 'data and to are required' }, { status: 400 })
  }
  if (chainId === undefined) {
    return Response.json({ error: 'chain_id is required' }, { status: 400 })
  }

  const upstream = await fetch(`${base}${DECODE_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chain_id: chainId,
      from,
      to,
      data,
      value,
    }),
    redirect: 'manual',
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}
