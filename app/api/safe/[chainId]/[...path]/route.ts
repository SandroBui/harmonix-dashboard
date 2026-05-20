import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// chainId -> Safe Transaction Service shortName. Only 999 (HyperEVM) is used today;
// extend this map as more chains are supported.
const SHORT_NAMES: Record<string, string> = { '999': 'hyper' }

function upstreamBase(chainId: string): string | null {
  const shortName = SHORT_NAMES[chainId]
  return shortName ? `https://api.safe.global/tx-service/${shortName}/api` : null
}

/**
 * Transparent proxy to the Safe Transaction Service.
 *
 * The browser SafeApiKit is configured with txServiceUrl=`/api/safe/<chainId>`
 * and NO apiKey, so the JWT never enters the client bundle. This route injects
 * the server-only `SAFE_API_KEY` as a Bearer token and forwards the request.
 *
 * Already gated by the Google-auth middleware in proxy.ts when GOOGLE_AUTH=true.
 */
async function proxy(req: NextRequest): Promise<Response> {
  const apiKey = process.env.SAFE_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'SAFE_API_KEY is not configured' }, { status: 500 })
  }

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

  const upstream = await fetch(`${base}${path}${req.nextUrl.search}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
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
