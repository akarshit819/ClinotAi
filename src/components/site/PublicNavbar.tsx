"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { Menu, X, Bot, ChevronDown } from "lucide-react"
import { FEATURES } from "./site-content"

const topLinks = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
  { label: "About", href: "/about" },
]

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PublicNavbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(false)
  const [mobileFeaturesOpen, setMobileFeaturesOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Close menus on route change and Escape.
  useEffect(() => {
    setMobileOpen(false)
    setFeaturesOpen(false)
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFeaturesOpen(false)
        setMobileOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  const openDropdown = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setFeaturesOpen(true)
  }
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setFeaturesOpen(false), 120)
  }

  const featuresActive = pathname === "/features" || pathname.startsWith("/features/")

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-3 sm:px-4 pt-3">
      <nav
        aria-label="Primary"
        className={cn(
          "mx-auto max-w-7xl rounded-2xl border px-4 sm:px-5 transition-all duration-300 ease-out-cubic",
          "bg-white/65 backdrop-blur-xl border-white/50",
          "dark:bg-navy-900/65 dark:border-white/10",
          scrolled || mobileOpen || featuresOpen
            ? "shadow-card-hover"
            : "shadow-card",
        )}
      >
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="Clinot home">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow transition-transform duration-200 group-hover:scale-105">
              <Bot className="h-5 w-5" />
            </div>
            <span className="text-base font-bold text-navy-900 tracking-tight">
              Clinot
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            <div
              ref={dropdownRef}
              className="relative"
              onMouseEnter={openDropdown}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                aria-expanded={featuresOpen}
                aria-haspopup="true"
                onClick={() => setFeaturesOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150",
                  featuresActive
                    ? "text-navy-900 bg-navy-50"
                    : "text-navy-500 hover:text-navy-900 hover:bg-navy-25",
                )}
              >
                Features
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", featuresOpen && "rotate-180")} />
              </button>
              {featuresOpen && (
                <div className="absolute left-1/2 top-full -translate-x-1/2 pt-2 animate-dropdown">
                  <div className="w-[26rem] rounded-2xl border border-navy-100 bg-white p-2 shadow-card-hover">
                    <Link
                      href="/features"
                      className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-navy-900 hover:bg-navy-25 transition-colors"
                    >
                      All features
                      <span className="block text-xs font-normal text-navy-400">Browse everything Clinot does</span>
                    </Link>
                    <div className="my-1 border-t border-navy-75" />
                    {FEATURES.map((f) => {
                      const Icon = f.icon
                      return (
                        <Link
                          key={f.href}
                          href={f.href}
                          className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-navy-25 transition-colors group"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 group-hover:bg-primary-100 transition-colors">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold text-navy-900">{f.title}</span>
                            <span className="block text-xs text-navy-400 leading-snug">{f.short}</span>
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {topLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(pathname, link.href) ? "page" : undefined}
                className={cn(
                  "px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150",
                  isActive(pathname, link.href)
                    ? "text-navy-900 bg-navy-50"
                    : "text-navy-500 hover:text-navy-900 hover:bg-navy-25",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/signup" className="group">
              <Button size="sm" className="bg-gradient-to-r from-primary-600 to-primary-500 shadow-glow hover:shadow-glow-lg hover:-translate-y-px transition-all duration-200">
                Get Started
              </Button>
            </Link>
          </div>

          <button
            type="button"
            className="md:hidden p-2.5 -mr-2 rounded-lg hover:bg-navy-25 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5 text-navy-600" /> : <Menu className="h-5 w-5 text-navy-600" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden mx-auto max-w-7xl px-3 sm:px-4">
          <nav
            aria-label="Mobile"
            className="mt-2 rounded-2xl border border-white/50 bg-white/90 backdrop-blur-xl shadow-card-hover px-3 py-3 max-h-[calc(100dvh-6rem)] overflow-y-auto animate-dropdown"
          >
            <button
              type="button"
              onClick={() => setMobileFeaturesOpen((v) => !v)}
              aria-expanded={mobileFeaturesOpen}
              className="flex w-full items-center justify-between px-3 py-3 text-base font-medium text-navy-700 hover:bg-navy-25 rounded-xl transition-colors min-h-[48px]"
            >
              Features
              <ChevronDown className={cn("h-4 w-4 text-navy-400 transition-transform duration-200", mobileFeaturesOpen && "rotate-180")} />
            </button>
            {mobileFeaturesOpen && (
              <div className="ml-2 pl-3 border-l-2 border-navy-100 space-y-0.5 animate-fade-in">
                <Link
                  href="/features"
                  className="block px-3 py-2.5 text-sm font-semibold text-navy-900 hover:bg-navy-25 rounded-lg transition-colors"
                >
                  All features
                </Link>
                {FEATURES.map((f) => (
                  <Link
                    key={f.href}
                    href={f.href}
                    className="block px-3 py-2.5 text-sm text-navy-600 hover:bg-navy-25 rounded-lg transition-colors"
                  >
                    {f.title}
                  </Link>
                ))}
              </div>
            )}
            {topLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-3 py-3 text-base font-medium text-navy-700 hover:bg-navy-25 rounded-xl transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/contact"
              className="block px-3 py-3 text-base font-medium text-navy-700 hover:bg-navy-25 rounded-xl transition-colors"
            >
              Contact
            </Link>
            <div className="flex gap-3 mt-5 pt-5 border-t border-navy-75">
              <Link href="/login" className="flex-1">
                <Button variant="secondary" className="w-full" size="lg">Sign In</Button>
              </Link>
              <Link href="/signup" className="flex-1">
                <Button className="w-full" size="lg">Get Started</Button>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
