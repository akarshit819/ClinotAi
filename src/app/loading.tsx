import { ClinotLogo } from "@/components/brand/ClinotLogo"

export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-25">
      <div className="flex flex-col items-center gap-3">
        <ClinotLogo size={36} />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <p className="text-sm text-navy-400">Loading...</p>
      </div>
    </div>
  )
}
