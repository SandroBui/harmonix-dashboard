type Props = {
  text: string
  children: React.ReactNode
  /** Tooltip position relative to the trigger. Default: 'top' */
  position?: 'top' | 'bottom'
  /** Max width in Tailwind units. Default: w-56 */
  width?: string
}

/**
 * Pure CSS tooltip — no JS, no 'use client' required.
 * Wraps children with a hover-triggered floating label.
 */
export default function Tooltip({
  text,
  children,
  position = 'top',
  width = 'w-56',
}: Props) {
  const positionClass =
    position === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
      : 'top-full left-1/2 -translate-x-1/2 mt-2'

  return (
    <span className="group relative inline-flex items-center gap-1">
      {children}
      {/* Info icon */}
      <span className="cursor-help select-none text-neutral-400 dark:text-neutral-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5"
        >
          <path
            fillRule="evenodd"
            d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0V8a.75.75 0 0 0-.75-.75h-1.5Z"
            clipRule="evenodd"
          />
        </svg>
      </span>
      {/* Tooltip bubble */}
      <span
        className={`pointer-events-none absolute ${positionClass} ${width} z-20 rounded-md bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-neutral-700 dark:ring-1 dark:ring-neutral-600`}
      >
        {text}
        {/* Arrow */}
        <span
          className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
            position === 'top'
              ? 'top-full border-t-neutral-900 dark:border-t-neutral-700'
              : 'bottom-full border-b-neutral-900 dark:border-b-neutral-700'
          }`}
        />
      </span>
    </span>
  )
}
