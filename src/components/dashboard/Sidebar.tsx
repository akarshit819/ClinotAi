"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  BookOpen,
  Settings,
  Key,
  LogOut,
  ChevronLeft,
  Menu,
  DollarSign,
  BarChart3,
  Link2,
  X,
} from "lucide-react"
import { removeTokenCookie } from "@/lib/auth-client"
import { AiPresence } from "@/components/ui/AiPresence"
import { ClinotLogo } from "@/components/brand/ClinotLogo"

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
}

interface NavSection {
  caption: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    caption: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/appointments", label: "Appointments", icon: CalendarCheck },
      { href: "/dashboard/patients", label: "Patient History", icon: Users },
    ],
  },
  {
    caption: "Configure",
    items: [
      { href: "/dashboard/knowledge", label: "Knowledge Base", icon: BookOpen },
      { href: "/dashboard/integrations", label: "Integrations", icon: Link2 },
      { href: "/dashboard/usage", label: "AI Usage", icon: BarChart3 },
      { href: "/dashboard/settings/ai-providers", label: "AI Providers", icon: Key },
      { href: "/dashboard/billing", label: "Billing", icon: DollarSign },
    ],
  },
  {
    caption: "System",
    items: [{ href: "/dashboard/settings", label: "Settings", icon: Settings }],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Desktop-only collapse; the sidebar is hidden off-canvas on mobile
  // until explicitly opened (avoids covering content on load).
  useEffect(() => {
    if (window.innerWidth < 768) setCollapsed(true)
  }, [])

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

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
        className="fixed left-4 top-4 z-50 rounded-xl border border-navy-100 bg-white p-2 shadow-card dark:border-navy-700 dark:bg-navy-800 md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5 text-navy-600 dark:text-navy-300" />
      </button>

      {/* Mobile scrim */}
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-navy-900/50 transition-opacity duration-200 md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/10 bg-navy-900/85 backdrop-blur-xl transition-all duration-200 ease-out-cubic",
          "md:sticky",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          collapsed ? "w-[240px] md:w-[68px]" : "w-[240px]",
        )}
      >
        <div className="flex h-14 items-center gap-3 border-b border-navy-800/50 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="Clinot home">
            <span className="inline-flex shrink-0 rounded-lg ring-1 ring-white/15">
              <ClinotLogo size={28} />
            </span>
            {!collapsed && (
              <span className="truncate text-sm font-semibold tracking-tight text-white">Clinot</span>
            )}
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-1 text-navy-500 transition-colors hover:bg-navy-800 hover:text-navy-300 md:hidden"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-md p-1 text-navy-500 transition-colors hover:bg-navy-800 hover:text-navy-300 md:flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
            </button>
          </div>
        </div>

        <nav className="scrollbar-hide flex-1 space-y-5 overflow-y-auto px-2 py-4">
          {navSections.map((section) => (
            <div key={section.caption}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-2xs font-semibold uppercase tracking-wider text-navy-500">
                  {section.caption}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-primary-500/10 font-medium text-primary-400"
                          : "font-medium text-navy-400 hover:bg-navy-800/50 hover:text-navy-200",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary-400 transition-all duration-200",
                          isActive ? "opacity-100 shadow-glow" : "opacity-0",
                        )}
                      />
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-navy-800/50 p-2">
          {!collapsed && (
            <div className="mb-1.5 flex items-center gap-2 rounded-lg px-3 py-1.5">
              <AiPresence label="AI receptionist live" />
            </div>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? "Sign Out" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-500 transition-colors duration-150 hover:bg-navy-800/50 hover:text-danger-400",
              collapsed && "justify-center px-0",
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
