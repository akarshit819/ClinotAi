import { Sidebar } from "@/components/dashboard/Sidebar"
import { ToastProvider } from "@/components/ui"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-navy-50/30 dark:bg-navy-950/50 flex">
      <Sidebar />
      <main className="flex-1 min-h-screen overflow-auto">
        <div className="p-4 md:p-6 lg:p-8 pt-16 md:pt-6">
          <ToastProvider>
            {children}
          </ToastProvider>
        </div>
      </main>
    </div>
  )
}
