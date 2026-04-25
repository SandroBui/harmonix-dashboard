'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type NavItem = { href: string; label: string; danger?: boolean }
type NavGroup = { label: string; items: NavItem[]; danger?: boolean }
type NavEntry = NavItem | NavGroup

const NAV: NavEntry[] = [
  { href: '/status', label: 'Overview' },
  {
    label: 'Configuration',
    items: [
      { href: '/vault-config', label: 'Vault Config' },
      { href: '/admin/nav', label: 'NAV Management' },
      { href: '/admin/roles', label: 'Roles' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/strategies', label: 'Strategies' },
      { href: '/withdrawals', label: 'Withdrawals' },
    ],
  },
  { href: '/safe-transactions', label: 'Safe Transactions' },
  {
    label: 'Security',
    danger: true,
    items: [
      { href: '/timelocks', label: 'Timelocks' },
      { href: '/emergency', label: 'Emergency', danger: true },
    ],
  },
]

function isGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).items !== undefined
}

export default function NavLinks() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const vaultParam = searchParams.get('vault')
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenGroup(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    setOpenGroup(null)
  }, [pathname])

  function buildHref(path: string) {
    if (!vaultParam) return path
    return `${path}?vault=${vaultParam}`
  }

  function isItemActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  function linkClass(active: boolean, danger?: boolean) {
    if (danger) {
      return active
        ? 'font-medium text-red-600 dark:text-red-400'
        : 'text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
    }
    return active
      ? 'font-medium text-neutral-900 dark:text-white'
      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
  }

  return (
    <div ref={rootRef} className="flex items-center gap-6">
      {NAV.map((entry) => {
        if (!isGroup(entry)) {
          const active = isItemActive(entry.href)
          return (
            <Link
              key={entry.href}
              href={buildHref(entry.href)}
              className={`text-sm ${linkClass(active, entry.danger)}`}
            >
              {entry.label}
            </Link>
          )
        }

        const groupActive = entry.items.some((i) => isItemActive(i.href))
        const isOpen = openGroup === entry.label

        return (
          <div key={entry.label} className="relative">
            <button
              type="button"
              onClick={() => setOpenGroup(isOpen ? null : entry.label)}
              className={`flex items-center gap-1 text-sm ${linkClass(groupActive, entry.danger)}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
            >
              {entry.label}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden
              >
                <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            {isOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-2 min-w-[180px] rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
              >
                {entry.items.map((item) => {
                  const active = isItemActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={buildHref(item.href)}
                      role="menuitem"
                      className={`block rounded px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${linkClass(
                        active,
                        item.danger,
                      )}`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
