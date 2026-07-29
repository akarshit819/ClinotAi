"use client"

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-sm text-navy-400">Failed to load dashboard data</p>
      <button onClick={reset} className="text-sm text-primary-500 hover:text-primary-600 underline">Try again</button>
    </div>
  )
}
