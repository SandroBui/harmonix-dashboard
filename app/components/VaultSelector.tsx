'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { VAULT_GROUPS } from '@/lib/vaults.config'
import { useVaultConfig } from '@/lib/vault-context'

export default function VaultSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentConfig = useVaultConfig()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Only render when there are multiple vault groups
  if (VAULT_GROUPS.length <= 1) return null

  function handleSelect(slug: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('vault', slug)
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Select vault"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:border-violet-600 dark:hover:bg-violet-900/50"
      >
        {/* Vault icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0 opacity-80"
        >
          <path
            fillRule="evenodd"
            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
            clipRule="evenodd"
          />
        </svg>
        <span className="max-w-[120px] truncate">{currentConfig.name}</span>
        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 shrink-0 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Vault Groups
          </div>
          <div className="pb-1">
            {VAULT_GROUPS.map((v) => {
              const isActive = v.slug === currentConfig.slug
              return (
                <button
                  key={v.slug}
                  onClick={() => handleSelect(v.slug)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
                      : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800'
                  }`}
                >
                  {/* Active indicator dot */}
                  <span
                    className={`mt-px h-2 w-2 shrink-0 rounded-full ${
                      isActive ? 'bg-violet-500' : 'bg-neutral-300 dark:bg-neutral-600'
                    }`}
                  />
                  <span className="flex-1 truncate font-medium">{v.name}</span>
                  {isActive && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 shrink-0 text-violet-500"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
