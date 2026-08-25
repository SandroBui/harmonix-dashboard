import type { NextRequest } from 'next/server'
import { SAFE_SHORT_NAMES } from '@/lib/safe/chains'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function upstreamBase(chainId: string): string | null {
  const shortName = SAFE_SHORT_NAMES[chainId]
  return shortName ? `https://api.safe.global/tx-service/${shortName}/api` : null
}

/**
 * Transparent proxy to the Safe Transaction Service.
 *
 * The browser SafeApiKit is configured with txServiceUrl=`/api/safe/<chainId>`
 * and NO apiKey, so credentials never enter the client bundle. When
 * `SAFE_API_KEY` is set it is forwarded as Bearer auth; HyperEVM's public
 * tx-service also works without a key.
 */
async function proxy(req: NextRequest): Promise<Response> {
  const apiKey = process.env.SAFE_API_KEY

  // Path shape: /api/safe/<chainId>/<remainder...>
  const chainId = req.nextUrl.pathname.split('/')[3] ?? ''
  const base = upstreamBase(chainId)
  if (!base) {
    return Response.json({ error: `Unsupported chainId ${chainId}` }, { status: 400 })
  }

  // Derive the remainder from the raw pathname (not catch-all params).
  const prefix = `/api/safe/${chainId}`
  const remainder = req.nextUrl.pathname.slice(prefix.length)
  if (!remainder.startsWith('/v1/') && !remainder.startsWith('/v2/')) {
    return Response.json({ error: 'Path not allowed' }, { status: 400 })
  }

  // Next.js strips trailing slashes from the URL before this handler runs, but
  // the Safe Transaction Service (Django APPEND_SLASH) requires them — re-add it
  // to the path segment, before the query string.
  const path = remainder.endsWith('/') ? remainder : `${remainder}/`

  const method = req.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  // When set, forward auth (production). HyperEVM tx-service also works without a key.
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const upstream = await fetch(`${base}${path}${req.nextUrl.search}`, {
    method,
    headers,
    body: hasBody ? await req.text() : undefined,
    redirect: 'manual',
  })

  // Pass the response through as raw text — confirmTransaction/proposeTransaction
  // return 201 with possibly-empty bodies, so re-parsing JSON would throw.
  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}

export const GET = proxy
export const POST = proxy
export const DELETE = proxy
