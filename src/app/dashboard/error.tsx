"use client"

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 bg-white dark:bg-navy-900">
      <p className="text-sm text-navy-400 dark:text-navy-400">Failed to load dashboard data</p>
      <p className="text-xs text-navy-300 dark:text-navy-500 max-w-sm text-center px-4">
        {error?.message ? error.message.slice(0, 160) : "An unexpected error occurred. Please try again."}
      </p>
      <button onClick={reset} className="text-sm text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25 rounded px-2 py-1">
        Try again
      </button>
    </div>
  )
}
