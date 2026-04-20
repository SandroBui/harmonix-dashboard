'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const NAV_LINKS: { href: string; label: string; danger?: boolean }[] = [
  { href: '/status', label: 'Status' },
  { href: '/vault-config', label: 'Vault Config' },
  { href: '/admin/nav', label: 'NAV Management' },
  { href: '/admin/roles', label: 'Roles' },
  { href: '/strategies', label: 'Strategies' },
  { href: '/withdrawals', label: 'Withdrawals' },
  { href: '/timelocks', label: 'Timelocks' },
  { href: '/safe-transactions', label: 'Safe Transactions' },
  { href: '/emergency', label: 'Emergency', danger: true },
]

export default function NavLinks() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const vaultParam = searchParams.get('vault')

  function buildHref(path: string) {
    if (!vaultParam) return path
    return `${path}?vault=${vaultParam}`
  }

  return (
    <>
      {NAV_LINKS.map(({ href, label, danger }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={buildHref(href)}
            className={`text-sm ${
              danger
                ? isActive
                  ? 'font-medium text-red-600 dark:text-red-400'
                  : 'text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
                : isActive
                  ? 'font-medium text-neutral-900 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </>
  )
}
