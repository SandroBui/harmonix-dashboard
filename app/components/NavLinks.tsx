'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/status', label: 'Status' },
  { href: '/vault-config', label: 'Vault Config' },
  { href: '/admin/nav', label: 'NAV Management' },
  { href: '/strategies', label: 'Strategies' },
  { href: '/withdrawals', label: 'Withdrawals' },
  { href: '/timelocks', label: 'Timelocks' },
  { href: '/safe-transactions', label: 'Safe Transactions' },
]

export default function NavLinks() {
  const pathname = usePathname()

  return (
    <>
      {NAV_LINKS.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={`text-sm ${
              isActive
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
