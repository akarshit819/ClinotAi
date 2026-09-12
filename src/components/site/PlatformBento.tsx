"use client"

import { useRef, type MouseEvent } from "react"
import Link from "next/link"
import { Bot, CalendarCheck, MessageSquare, MessageCircle, LayoutDashboard, ArrowRight, CheckCircle2 } from "lucide-react"
import { SectionHeader } from "./SectionHeader"
import { Reveal } from "./Reveal"

/**
 * Apple/Linear-style bento grid for the homepage platform section.
 * Each card has its own visual personality; the two hero cards carry
 * miniature product mocks. A single delegated mousemove handler paints
 * a cursor spotlight per card (desktop pointers only — pure CSS
 * hover on touch).
 */
export function PlatformBento() {
  const gridRef = useRef<HTMLDivElement>(null)

  const onMove = (e: MouseEvent) => {
    const grid = gridRef.current
    if (!grid) return
    if (window.matchMedia("(pointer: coarse)").matches) return
    const card = (e.target as HTMLElement).closest<HTMLElement>(".spot-card")
    if (!card || !grid.contains(card)) return
    const box = card.getBoundingClientRect()
    card.style.setProperty("--spot-x", `${e.clientX - box.left}px`)
    card.style.setProperty("--spot-y", `${e.clientY - box.top}px`)
  }

  return (
    <section aria-label="What Clinot does" className="relative py-20 md:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-25 via-white to-gray-25 pointer-events-none" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge="Platform"
          title="Everything a front desk does, always on"
          subtitle="Five connected capabilities. Each one useful alone, powerful together."
        />
        <div ref={gridRef} onMouseMove={onMove} className="grid md:grid-cols-3 gap-4">
          {/* Hero card: AI Receptionist with mini chat mock */}
          <Reveal className="md:col-span-2">
            <Link
              href="/features/ai-receptionist"
              className="spot-card group flex h-full flex-col sm:flex-row gap-6 p-6 md:p-8 rounded-3xl glass-panel hover:-translate-y-1 transition-all duration-200 ease-out-cubic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25"
              aria-label="AI Receptionist — learn more"
            >
              <span className="flex-1">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow mb-4 transition-transform duration-200 group-hover:scale-105">
                  <Bot className="h-5 w-5" />
                </span>
                <span className="block text-lg font-semibold text-navy-900 mb-1.5">AI Receptionist</span>
                <span className="block text-sm text-navy-400 leading-relaxed mb-4">
                  Answers routine patient questions instantly from your approved clinic knowledge — with
                  strict clinic-only boundaries and emergency detection.
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 group-hover:gap-2.5 transition-all duration-200">
                  Learn more <ArrowRight className="h-4 w-4" />
                </span>
              </span>
              <span aria-hidden="true" className="flex-1 rounded-2xl border border-white/60 bg-white/50 backdrop-blur-sm p-4 space-y-2.5 self-center w-full">
                <span className="block max-w-[85%] rounded-xl rounded-tl-sm bg-navy-900/[0.06] px-3 py-2 text-xs font-medium text-navy-700">
                  Do you take Delta Dental?
                </span>
                <span className="block max-w-[90%] ml-auto rounded-xl rounded-tr-sm bg-primary-500 px-3 py-2 text-xs font-medium text-white shadow-glow">
                  Yes — we&apos;re in-network. Want me to book your cleaning?
                </span>
              </span>
            </Link>
          </Reveal>

          {/* Hero card: Appointments with confirmation mock */}
          <Reveal delay={80}>
            <Link
              href="/features/appointments"
              className="spot-card group flex h-full flex-col p-6 md:p-8 rounded-3xl bg-navy-900 text-white overflow-hidden relative hover:-translate-y-1 transition-all duration-200 ease-out-cubic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25"
              aria-label="Appointment Management — learn more"
            >
              <span aria-hidden="true" className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary-500/30 blur-3xl" />
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 mb-4 transition-transform duration-200 group-hover:scale-105 relative">
                <CalendarCheck className="h-5 w-5" />
              </span>
              <span className="block text-lg font-semibold mb-1.5 relative">Appointment Management</span>
              <span className="block text-sm text-white/60 leading-relaxed mb-5 relative">
                Requests collected, confirmed with the patient, and handed to your team.
              </span>
              <span aria-hidden="true" className="mt-auto rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-4 relative">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/20 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold">Sat · 9:30 AM
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                    </span>
                    <span className="block text-[11px] text-emerald-300 font-medium">Confirmed with patient</span>
                  </span>
                </span>
              </span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white group-hover:gap-2.5 transition-all duration-200 relative">
                Learn more <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </Reveal>

          {/* Small cards */}
          {[
            { icon: MessageSquare, title: "Patient Communication", desc: "Every inquiry in one inbox — nothing lost to voicemail.", href: "/features/patient-communication" },
            { icon: MessageCircle, title: "WhatsApp Integration", desc: "Meet patients where they message, with reliable delivery.", href: "/features/whatsapp" },
            { icon: LayoutDashboard, title: "Clinic Dashboard", desc: "Appointments, patients, and insights in one view.", href: "/features/dashboard" },
          ].map((c, i) => {
            const Icon = c.icon
            return (
              <Reveal key={c.title} delay={Math.min(i * 60, 120)}>
                <Link
                  href={c.href}
                  className="spot-card group flex h-full flex-col p-6 rounded-3xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover hover:border-primary-200 hover:-translate-y-1 transition-all duration-200 ease-out-cubic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25"
                  aria-label={`${c.title} — learn more`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 mb-4 transition-all duration-200 group-hover:bg-primary-100 group-hover:scale-105">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="block text-sm font-semibold text-navy-900 mb-1.5">{c.title}</span>
                  <span className="block text-xs text-navy-400 leading-relaxed flex-1">{c.desc}</span>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 group-hover:gap-2.5 transition-all duration-200">
                    Learn more <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
