"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { Menu, X, Bot } from "lucide-react"
import Link from "next/link"

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "After Hours", href: "#after-hours" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out-cubic",
        scrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-navy-75/50 shadow-sm"
          : "bg-transparent",
      )}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-white transition-transform duration-200 group-hover:scale-105">
              <Bot className="h-5 w-5" />
            </div>
            <span className="text-base font-bold text-navy-900 tracking-tight">
              Clinot
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-2 text-sm font-medium text-navy-500 hover:text-navy-900 rounded-lg hover:bg-navy-25 transition-all duration-150"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <a href="#demo-chat">
              <Button size="sm">Book a Demo</Button>
            </a>
          </div>

          <button
            className="md:hidden p-2 rounded-lg hover:bg-navy-25 transition-colors"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle navigation"
          >
            {isOpen ? <X className="h-5 w-5 text-navy-600" /> : <Menu className="h-5 w-5 text-navy-600" />}
          </button>
        </div>

        {isOpen && (
          <div className="md:hidden pb-4 border-t border-navy-75 pt-3 mt-1 animate-fade-in">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2.5 text-sm font-medium text-navy-600 hover:bg-navy-25 rounded-lg transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="flex gap-2 mt-3 pt-3 border-t border-navy-75">
                <Link href="/login" className="flex-1">
                  <Button variant="ghost" className="w-full">Sign In</Button>
                </Link>
                <a href="#demo-chat" className="flex-1">
                  <Button className="w-full">Book a Demo</Button>
                </a>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
