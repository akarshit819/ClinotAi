import type { Metadata } from "next"
import Link from "next/link"
import { Hero } from "@/components/landing/Hero"
import { CTASection } from "@/components/site/CTASection"
import { PlatformBento } from "@/components/site/PlatformBento"
import { SectionHeader } from "@/components/site/SectionHeader"
import { Reveal } from "@/components/site/Reveal"
import { Button } from "@/components/ui/Button"
import {
  ArrowRight,
  Clock,
  CalendarCheck,
  Inbox,
  ShieldCheck,
  Zap,
  MessageCircle,
  Bell,
} from "lucide-react"

export const metadata: Metadata = {
  title: "24/7 AI Receptionist for Healthcare Practices",
  description:
    "Clinot answers routine patient questions instantly, collects appointment requests, and supports your clinic 24/7 — without replacing your team.",
}

const valueProps = [
  { icon: Clock, title: "Always answering", desc: "Patients get help in under a minute, even after hours." },
  { icon: CalendarCheck, title: "Appointments captured", desc: "Requests arrive organized, ready for your confirmation." },
  { icon: Inbox, title: "One shared inbox", desc: "Every inquiry, conversation, and lead in a single view." },
  { icon: ShieldCheck, title: "Team stays in control", desc: "Nothing is confirmed without your approval. Ever." },
]

const previewSteps = [
  {
    icon: Zap,
    step: "Step 1",
    title: "Connect your clinic",
    desc: "Tell Clinot about your services, hours, doctors, and policies. Live in under 30 minutes.",
  },
  {
    icon: MessageCircle,
    step: "Step 2",
    title: "Patients message you",
    desc: "Questions arrive over WhatsApp and your website — day, night, and weekends.",
  },
  {
    icon: Bell,
    step: "Step 3",
    title: "Clinot + your team respond",
    desc: "Routine questions answered instantly. Requests land in your dashboard for confirmation.",
  },
]

export default function Home() {
  return (
    <>
      <Hero />

      {/* Value strip */}
      <section aria-label="Why clinics choose Clinot" className="relative border-y border-navy-100/60 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 md:py-12">
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {valueProps.map((item, i) => {
              const Icon = item.icon
              return (
                <Reveal key={item.title} delay={Math.min(i * 60, 180)} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <dt className="block text-sm font-semibold text-navy-900">{item.title}</dt>
                    <dd className="block text-xs text-navy-400 leading-relaxed mt-0.5">{item.desc}</dd>
                  </span>
                </Reveal>
              )
            })}
          </dl>
        </div>
      </section>

      {/* Platform bento */}
      <PlatformBento />

      {/* How it works preview */}
      <section aria-label="How Clinot works" className="relative py-20 md:py-28 bg-white overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="How it works"
            title="Live in three steps"
            subtitle="Faster than onboarding a new team member. No training needed."
          />
          <ol className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {previewSteps.map((s, i) => {
              const Icon = s.icon
              return (
                <Reveal as="li" key={s.title} delay={Math.min(i * 80, 160)} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-medium text-navy-400">{s.step}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-navy-900 mb-1.5">{s.title}</h3>
                  <p className="text-xs text-navy-400 leading-relaxed">{s.desc}</p>
                </Reveal>
              )
            })}
          </ol>
          <Reveal className="text-center mt-8">
            <Link href="/how-it-works" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:gap-2.5 transition-all">
              Explore how Clinot works
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>


      <CTASection />
    </>
  )
}
