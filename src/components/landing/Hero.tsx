import Link from "next/link"
import { Button } from "@/components/ui/Button"
import { ArrowRight, Play, MessageCircle, CalendarCheck, ShieldCheck, LayoutDashboard } from "lucide-react"
import { HeroVisual } from "@/components/site/HeroVisual"
import { ClinotLogo } from "@/components/brand/ClinotLogo"

const trustItems = [
  { icon: MessageCircle, label: "WhatsApp & website chat" },
  { icon: CalendarCheck, label: "Appointment capture" },
  { icon: ShieldCheck, label: "Clinic-only AI boundaries" },
  { icon: LayoutDashboard, label: "Team dashboard" },
]

/**
 * Clinot AI grand entrance: cinematic two-column hero. Ambient light,
 * drifting grid, staggered entrance, and a floating glass AI system
 * visualization beside confident typography.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 md:pt-36">
      {/* Futuristic ambient background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-25/60 via-gray-25 to-gray-25" />
        <div className="hero-grid-drift absolute -inset-8 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_35%,black,transparent)]" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-[42rem] max-w-none rounded-full bg-primary-300/25 blur-3xl" />
        <div className="orb-breathe absolute top-24 -left-32 h-80 w-80 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="orb-breathe absolute top-64 -right-32 h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl" style={{ animationDelay: "2.5s" }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 pb-14 md:pb-20">
          {/* Copy */}
          <div className="text-center lg:text-left max-w-2xl mx-auto lg:mx-0 order-2 lg:order-1">
            <div className="hero-enter inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 py-1.5 pl-1.5 pr-3.5 shadow-sm backdrop-blur-md mb-7" style={{ animationDelay: "0.05s" }}>
              <ClinotLogo size={20} priority />
              <span className="text-xs font-semibold tracking-wide text-navy-700">
                Clinot AI · AI Front Desk for Clinics
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <h1 className="hero-enter text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[4.4rem] font-bold text-navy-900 tracking-tight text-balance" style={{ animationDelay: "0.15s" }}>
              Your clinic&apos;s
              <br />
              AI front desk.
              <br />
              <span className="text-brand-gradient">Always on.</span>
            </h1>

            <p className="hero-enter text-base md:text-lg text-navy-400 max-w-xl mx-auto lg:mx-0 mt-6 leading-relaxed text-balance" style={{ animationDelay: "0.3s" }}>
              Clinot answers routine patient questions, captures appointment requests, and helps
              your team respond faster — 24 hours a day.
            </p>

            <div className="hero-enter flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 mt-9" style={{ animationDelay: "0.42s" }}>
              <Link href="/signup" className="group w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-gradient-to-r from-primary-600 to-primary-500 shadow-glow-lg hover:shadow-glow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="/demo" className="group w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full sm:w-auto bg-white/60 backdrop-blur-md border-white/60 hover:bg-white/85 hover:-translate-y-0.5 transition-all duration-200"
                >
                  <Play className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                  See It Live
                </Button>
              </Link>
            </div>
          </div>

          {/* Visual */}
          <div className="order-1 lg:order-2">
            <HeroVisual />
          </div>
        </div>

        {/* Truthful trust strip */}
        <div className="hero-enter relative border-t border-navy-100/70" style={{ animationDelay: "0.55s" }}>
          <ul className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 py-7">
            {trustItems.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.label} className="flex items-center justify-center lg:justify-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 border border-white/60 text-primary-600 shadow-sm backdrop-blur-md">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[13px] font-semibold text-navy-700">{item.label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
