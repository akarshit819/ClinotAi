export default function DashboardLoading() {
  return (
    <div className="space-y-8 p-6">
      <div className="space-y-1 animate-pulse">
        <div className="h-6 w-48 rounded-lg bg-navy-100" />
        <div className="h-4 w-72 rounded-lg bg-navy-50" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-navy-75 bg-white p-5 space-y-3">
            <div className="h-4 w-24 rounded-lg bg-navy-50" />
            <div className="h-8 w-16 rounded-lg bg-navy-100" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-32 rounded-lg bg-navy-50" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-navy-75 bg-white p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-navy-50" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 rounded-lg bg-navy-100" />
              <div className="h-3 w-24 rounded-lg bg-navy-50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
