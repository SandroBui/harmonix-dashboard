import { cookies } from "next/headers"
import { NextResponse } from "next/server"

/** Clear both secure/non-secure Auth.js cookies, including chunked session tokens. */
const AUTH_COOKIE_PREFIXES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.pkce.code_verifier",
  "__Secure-authjs.pkce.code_verifier",
]

export async function POST() {
  const cookieStore = await cookies()

  for (const { name } of cookieStore.getAll()) {
    const shouldDelete = AUTH_COOKIE_PREFIXES.some(
      (prefix) => name === prefix || name.startsWith(`${prefix}.`),
    )
    if (shouldDelete) {
      cookieStore.delete(name)
    }
  }

  return NextResponse.json({ ok: true })
}
