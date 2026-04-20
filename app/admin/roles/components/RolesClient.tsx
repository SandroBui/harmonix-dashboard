'use client'

import { useEffect, useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useChainId } from 'wagmi'
import { useRoleCheck } from '@/lib/safe/hooks'
import type { RolesPageData } from '@/lib/roles-reader'
import RoleSection from './RoleSection'

const AUTO_REFRESH_MS = 60_000

export default function RolesClient({ data }: { data: RolesPageData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [secondsAgo, setSecondsAgo] = useState(0)
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const admin = useRoleCheck('admin')
  const sentinel = useRoleCheck('sentinel')
  const isWrongChain = isConnected && chainId !== 999

  useEffect(() => {
    const interval = setInterval(() => {
      startTransition(() => router.refresh())
    }, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [router])

  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - data.fetchedAt) / 1_000)))
    }, 1_000)
    return () => clearInterval(ticker)
  }, [data.fetchedAt])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Roles Management
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            AccessManager:{' '}
            <span className="font-mono text-xs">{data.accessManagerAddress}</span>
          </p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <button
            onClick={() => startTransition(() => router.refresh())}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14" height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isPending ? 'animate-spin' : ''}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {isPending ? 'Refreshing…' : 'Refresh'}
          </button>
          <p className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            {isPending ? (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            )}
            {isPending ? 'Updating…' : `Updated ${secondsAgo}s ago`}
            <span className="text-neutral-300 dark:text-neutral-600">·</span>
            auto-refresh every {AUTO_REFRESH_MS / 1_000}s
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {data.roles.map((roleInfo) => (
          <RoleSection
            key={roleInfo.role}
            roleInfo={roleInfo}
            accessManagerAddress={data.accessManagerAddress}
            adminSafeAddress={admin.safeAddress}
            isConnected={isConnected}
            isWrongChain={isWrongChain}
            isAdminSafeOwner={admin.isSafeOwner}
            adminHasRole={admin.hasRole}
            sentinelHasRole={sentinel.hasRole}
          />
        ))}
      </div>
    </div>
  )
}
