export default function ChatLoading() {
  return (
    <div className="flex h-screen flex-col bg-gray-25 animate-pulse">
      <div className="flex items-center gap-3 border-b border-navy-75 bg-white px-4 py-3">
        <div className="h-8 w-8 rounded-xl bg-navy-100" />
        <div className="space-y-1">
          <div className="h-4 w-28 rounded-lg bg-navy-100" />
          <div className="h-3 w-20 rounded-lg bg-navy-50" />
        </div>
      </div>
      <div className="flex-1 space-y-4 p-4">
        <div className="flex justify-start">
          <div className="h-16 w-64 rounded-2xl bg-navy-50 rounded-bl-md" />
        </div>
        <div className="flex justify-end">
          <div className="h-12 w-48 rounded-2xl bg-primary-100 rounded-br-md" />
        </div>
        <div className="flex justify-start">
          <div className="h-20 w-72 rounded-2xl bg-navy-50 rounded-bl-md" />
        </div>
      </div>
      <div className="border-t border-navy-75 bg-white p-4">
        <div className="h-10 w-full rounded-xl bg-navy-50" />
      </div>
    </div>
  )
}
