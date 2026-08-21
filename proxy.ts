import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  if (process.env.GOOGLE_AUTH !== "true") return NextResponse.next()

  const session = await auth()
  const loggedIn = Boolean(session?.user?.email)
  const { pathname } = request.nextUrl

  if (!loggedIn && pathname !== "/login") {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (loggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api/auth|api/logout|_next/static|_next/image|favicon.ico).*)",
  ],
}
