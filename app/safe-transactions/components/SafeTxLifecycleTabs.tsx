'use client'

export type SafeTxLifecycleTab = 'pending' | 'history'

const TAB_LABELS: Record<SafeTxLifecycleTab, string> = {
  pending: 'Pending',
  history: 'History',
}

const TABS: SafeTxLifecycleTab[] = ['pending', 'history']

type Props = {
  activeTab: SafeTxLifecycleTab
  onTabChange: (tab: SafeTxLifecycleTab) => void
  pendingCount?: number
}

export default function SafeTxLifecycleTabs({ activeTab, onTabChange, pendingCount }: Props) {
  return (
    <div className="mb-4 flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onTabChange(tab)}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === tab
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          {TAB_LABELS[tab]}
          {tab === 'pending' && pendingCount !== undefined && pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {pendingCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
