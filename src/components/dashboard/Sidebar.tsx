"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Bot,
  LayoutDashboard,
  CalendarCheck,
  Users,
  BookOpen,
  Settings,
  Key,
  Code2,
  LogOut,
  ChevronLeft,
  Menu,
  DollarSign,
  Globe,
  BarChart3,
  Inbox,
  Link2,
} from "lucide-react"
import { removeTokenCookie } from "@/lib/auth-client"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/integrations", label: "Integrations", icon: Link2 },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/appointments", label: "Appointments", icon: CalendarCheck },
  { href: "/dashboard/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/dashboard/website-integration", label: "Integration", icon: Globe },
  { href: "/dashboard/widget", label: "Widget", icon: Code2 },
  { href: "/dashboard/usage", label: "AI Usage", icon: BarChart3 },
  { href: "/dashboard/settings/ai-providers", label: "AI Providers", icon: Key },
  { href: "/dashboard/billing", label: "Billing", icon: DollarSign },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // server-side logout is best-effort; clear cookie client-side regardless
    }
    removeTokenCookie()
    router.push("/")
  }

  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-white border border-navy-100 shadow-sm"
        onClick={() => setCollapsed(!collapsed)}
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5 text-navy-600" />
      </button>

      <aside
        className={cn(
          "fixed md:sticky top-0 left-0 h-screen bg-navy-900 border-r border-navy-800/50 flex flex-col transition-all duration-300 ease-out-cubic z-40",
          collapsed ? "-translate-x-full md:translate-x-0 md:w-[68px]" : "translate-x-0 w-[240px]",
        )}
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-navy-800/50">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500">
              <Bot className="h-4 w-4 text-white" />
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-white tracking-tight">Clinot</span>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex ml-auto p-1 rounded-md hover:bg-navy-800 text-navy-500 hover:text-navy-300 transition-colors"
            aria-label="Toggle sidebar collapse"
          >
            <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                  isActive
                    ? "bg-primary-500/10 text-primary-400 font-medium"
                    : "text-navy-400 hover:text-navy-200 hover:bg-navy-800/50 font-medium",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="p-2 border-t border-navy-800/50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-navy-500 hover:text-danger-400 hover:bg-navy-800/50 w-full transition-all duration-150"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
