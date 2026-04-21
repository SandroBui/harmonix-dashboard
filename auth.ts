import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

const allowedEmails = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    signIn({ user }) {
      if (allowedEmails.length === 0) return true
      return allowedEmails.includes((user.email ?? "").toLowerCase())
    },
  },
})
