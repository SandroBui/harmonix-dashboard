"use client"

import { useEffect, useRef, useState } from "react"
import { signOut } from "next-auth/react"

type Props = {
  name?: string | null
  image?: string | null
}

async function performLogout() {
  try {
    await Promise.race([
      fetch("/api/logout", { method: "POST", credentials: "same-origin" }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  } catch {
    // ignore
  }

  try {
    await Promise.race([
      signOut({ redirect: false }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  } catch {
    // ignore
  }

  window.location.assign("/login")
}

function initials(name?: string | null) {
  if (!name?.trim()) return "?"
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export default function AccountMenu({ name, image }: Props) {
  const [open, setOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-[10px] font-medium text-neutral-600 ring-offset-2 hover:ring-2 hover:ring-neutral-300 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:ring-neutral-600"
      >
        {image ? (
          <img src={image} alt={name ?? "Account"} className="h-7 w-7 object-cover" />
        ) : (
          <span>{initials(name)}</span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[140px] overflow-hidden rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        >
          <button
            type="button"
            role="menuitem"
            disabled={isLoggingOut}
            onClick={() => {
              if (isLoggingOut) return
              setIsLoggingOut(true)
              void performLogout()
            }}
            className="block w-full rounded px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  )
}
