import { Sidebar } from "@/components/dashboard/Sidebar"
import { ToastProvider } from "@/components/ui"
import { AppBackdrop } from "@/components/ui/AppBackdrop"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen bg-gray-25 dark:bg-navy-950">
      <AppBackdrop variant="app" />
      <Sidebar />
      <main className="relative min-h-screen flex-1 overflow-auto">
        <div className="p-4 pt-16 md:p-6 md:pt-6 lg:p-8">
          <ToastProvider>
            {children}
          </ToastProvider>
        </div>
      </main>
    </div>
  )
}
