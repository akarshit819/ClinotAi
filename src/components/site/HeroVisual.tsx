"use client"

import { useEffect, useRef } from "react"
import { CalendarCheck, CheckCircle2, LayoutDashboard } from "lucide-react"
import { ClinotLogo } from "@/components/brand/ClinotLogo"

/**
 * Abstract Clinot AI visualization: a glowing core ringed by floating
 * glass panels (patient message → AI answer → confirmed appointment →
 * dashboard signal). Motion is transform/opacity only; mouse parallax
 * runs on desktop pointers via rAF-throttled direct style writes (no
 * re-renders), and everything collapses gracefully under
 * prefers-reduced-motion or on touch devices.
 */
export function HeroVisual() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (window.matchMedia("(pointer: coarse)").matches) return
    let raf = 0
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect()
        // Skip work when the visual is off-screen.
        if (box.bottom < 0 || box.top > window.innerHeight) return
        const x = (e.clientX - (box.left + box.width / 2)) / box.width
        const y = (e.clientY - (box.top + box.height / 2)) / box.height
        el.querySelectorAll<HTMLElement>("[data-depth]").forEach((node) => {
          const depth = parseFloat(node.dataset.depth || "0")
          // `translate` composes with the `transform` float keyframes.
          node.style.translate = `${(-x * depth * 22).toFixed(1)}px ${(-y * depth * 16).toFixed(1)}px`
        })
      })
    }
    window.addEventListener("mousemove", onMove, { passive: true })
    return () => {
      window.removeEventListener("mousemove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label="Abstract visualization of Clinot AI answering a patient and confirming an appointment"
      className="relative mx-auto h-[380px] w-full max-w-[520px] select-none sm:h-[440px] lg:h-[520px]"
    >
      {/* Ambient halo behind the core */}
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="orb-breathe h-56 w-56 sm:h-72 sm:w-72 rounded-full bg-primary-400/25 blur-3xl" />
      </div>
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-40 w-40 sm:h-52 sm:w-52 rounded-full bg-cyan-300/20 blur-3xl" />
      </div>

      {/* Core: the official Clinot mark, glowing */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hero-enter" style={{ animationDelay: "0.45s" }}>
        <div data-depth="0.35" className="relative">
          <div className="glass-panel flex h-28 w-28 sm:h-36 sm:w-36 items-center justify-center rounded-[2rem]">
            <ClinotLogo size={72} priority className="rounded-[24%] shadow-glow-lg" />
          </div>
          <div className="glass-panel absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-navy-800">Clinot AI · Online</span>
          </div>
        </div>
      </div>

      {/* Panel: patient message (top-left) */}
      <div
        data-depth="0.8"
        className="glass-panel float-gentle absolute left-0 top-2 w-44 sm:w-52 rounded-2xl p-3 hero-enter"
        style={{ animationDelay: "0.6s" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400 mb-1">Patient</p>
        <p className="text-xs sm:text-[13px] font-medium text-navy-800 leading-snug">
          Do you have Saturday hours?
        </p>
      </div>

      {/* Panel: AI answer (right) */}
      <div
        data-depth="1"
        className="glass-panel float-gentle-slow absolute right-0 top-16 sm:top-20 w-48 sm:w-60 rounded-2xl p-3 hero-enter"
        style={{ animationDelay: "0.7s" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 mb-1">Clinot AI</p>
        <p className="text-xs sm:text-[13px] font-medium text-navy-800 leading-snug">
          Yes — we&apos;re open 9–1. Want me to book you in?
        </p>
      </div>

      {/* Panel: appointment confirmed (bottom-left) */}
      <div
        data-depth="0.6"
        className="glass-panel float-gentle-slow absolute bottom-8 left-2 sm:left-6 rounded-2xl p-3 pr-4 hero-enter"
        style={{ animationDelay: "0.8s" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
            <CalendarCheck className="h-4.5 w-4.5" />
          </span>
          <span>
            <span className="flex items-center gap-1 text-xs sm:text-[13px] font-semibold text-navy-800">
              Sat · 9:30 AM
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </span>
            <span className="block text-[10px] font-medium text-emerald-600">Appointment confirmed</span>
          </span>
        </div>
      </div>

      {/* Panel: dashboard signal (bottom-right, desktop only) */}
      <div
        data-depth="0.9"
        className="glass-panel float-gentle absolute bottom-2 right-2 hidden w-44 rounded-2xl p-3 sm:block hero-enter"
        style={{ animationDelay: "0.9s" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <LayoutDashboard className="h-3.5 w-3.5 text-primary-600" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">Dashboard</p>
        </div>
        <div className="space-y-1.5" aria-hidden="true">
          <div className="h-1.5 rounded-full bg-primary-500/70 w-4/5" />
          <div className="h-1.5 rounded-full bg-navy-200 w-3/5" />
          <div className="h-1.5 rounded-full bg-emerald-400/80 w-2/5" />
        </div>
        <p className="mt-2 text-[10px] font-semibold text-navy-700">3 requests today</p>
      </div>
    </div>
  )
}
