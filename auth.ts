import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

function getApiBaseUrl(): string {
  const baseUrl =
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL
  if (!baseUrl) {
    throw new Error(
      "API_BASE_URL or NEXT_PUBLIC_API_BASE_URL is not configured",
    )
  }
  return baseUrl.replace(/\/$/, "")
}

async function exchangeGoogleIdToken(idToken: string): Promise<string> {
  const url = `${getApiBaseUrl()}/api/v1/admin/auth/google`
  // Runs on the Next.js server → backend. Will NOT appear in the browser Network tab.
  console.info(`[auth] Exchanging Google id_token via POST ${url}`)

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
    cache: "no-store",
  })

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText)
    console.error(`[auth] Backend Google auth failed (${res.status}):`, message)
    throw new Error(
      message || `Failed to exchange Google token with backend: ${res.status}`,
    )
  }

  const data = (await res.json()) as {
    access_token: string
    token_type?: string
    email?: string
  }

  if (!data.access_token) {
    throw new Error("Backend Google auth did not return an access_token")
  }

  console.info(
    `[auth] Backend access_token acquired for ${data.email ?? "unknown email"}`,
  )
  return data.access_token
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Required on Vercel/staging so Auth.js trusts the Host header
  // (otherwise sign-in/sign-out CSRF can fail when AUTH_URL mismatches).
  trustHost: true,
  // Keep cookie names consistent on HTTPS deploys even if AUTH_URL is wrongly
  // set to http://localhost (otherwise signOut clears the wrong cookie).
  useSecureCookies:
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user?.email)
    },
    async jwt({ token, account, profile }) {
      // Only runs on the initial OAuth sign-in (when `account` is present).
      // Subsequent session reads reuse the JWT — no re-exchange.
      if (account) {
        if (!account.id_token) {
          console.error(
            "[auth] Google account has no id_token; cannot call /api/v1/admin/auth/google",
          )
          throw new Error(
            "Google did not return an id_token. Ensure openid scope is enabled.",
          )
        }
        token.accessToken = await exchangeGoogleIdToken(account.id_token)
        if (profile?.email) {
          token.email = profile.email
        }
      }
      return token
    },
    async session({ session, token }) {
      if (!token.email && !session.user?.email) {
        return { ...session, user: undefined, accessToken: undefined }
      }
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined
      return session
    },
  },
})
