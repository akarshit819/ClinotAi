import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { SectionHeader } from "@/components/site/SectionHeader"
import { RelatedFeatures } from "@/components/site/FeatureCard"
import { CTASection } from "@/components/site/CTASection"
import { Reveal } from "@/components/site/Reveal"
import {
  MessageSquare,
  CalendarCheck,
  CheckCircle2,
  Copy,
  Bell,
  RefreshCw,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Appointment Management",
  description:
    "Clinot collects appointment requests conversationally, confirms details with patients, prevents duplicates, and notifies your team — you always confirm.",
}

const capabilities = [
  {
    icon: MessageSquare,
    title: "Conversational request collection",
    desc: "Name, phone, reason, date, and time gathered naturally — even when patients send everything in one message.",
  },
  {
    icon: CheckCircle2,
    title: "Confirm-before-booking",
    desc: "Patients review a clear summary and explicitly confirm. Nothing is created silently.",
  },
  {
    icon: Copy,
    title: "Duplicate prevention",
    desc: "Repeat confirmations reuse the existing appointment instead of creating doubles.",
  },
  {
    icon: CalendarCheck,
    title: "Real availability",
    desc: "Times offered come from genuinely open slots — never invented by the AI.",
  },
  {
    icon: RefreshCw,
    title: "Reschedule & cancel",
    desc: "Patients can move or cancel appointments conversationally, and the dashboard always reflects reality.",
  },
  {
    icon: Bell,
    title: "Patient notifications",
    desc: "When your team changes an appointment, the patient is notified on WhatsApp automatically.",
  },
]

export default function AppointmentsPage() {
  return (
    <>
      <PageHero
        badge="Appointments"
        title="Appointment requests that arrive ready to confirm"
        subtitle="Clinot collects every detail, double-checks it with the patient, and hands your team a clean request — you stay in control."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <section aria-label="The problem" className="relative pb-16 md:pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <h2 className="text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-4 text-balance">
              Booking by phone tag loses patients
            </h2>
            <p className="text-base text-navy-400 leading-relaxed">
              Missed calls, voicemail, and back-and-forth messages turn simple bookings into lost
              opportunities. Clinot captures the request the moment intent appears — at any hour.
            </p>
          </Reveal>
        </div>
      </section>

      <section aria-label="How appointment capture works" className="relative py-16 md:py-20 bg-white border-y border-navy-100/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="How it works"
            title="From chat to confirmed, in four moves"
          />
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {[
              { step: "Step 1", title: "Patient asks", desc: "“I want to book an appointment” — Clinot opens a structured request." },
              { step: "Step 2", title: "Details collected", desc: "Name, contact, reason, date, and time — step by step or all at once." },
              { step: "Step 3", title: "Patient confirms", desc: "A plain-language summary. The booking happens only on explicit confirmation." },
              { step: "Step 4", title: "Team reviews", desc: "The appointment appears in your dashboard for final confirmation and follow-up." },
            ].map((s, i) => (
              <Reveal as="li" key={s.title} delay={Math.min(i * 60, 180)} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
                <span className="text-xs font-medium text-navy-400">{s.step}</span>
                <h3 className="text-sm font-semibold text-navy-900 mt-1 mb-1.5">{s.title}</h3>
                <p className="text-xs text-navy-400 leading-relaxed">{s.desc}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section aria-label="Capabilities" className="relative py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Capabilities"
            title="Careful where it matters"
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {capabilities.map((c, i) => {
              const Icon = c.icon
              return (
                <Reveal key={c.title} delay={Math.min(i * 60, 300)} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 mb-4">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-navy-900 mb-1.5">{c.title}</h3>
                  <p className="text-xs text-navy-400 leading-relaxed">{c.desc}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <RelatedFeatures currentSlug="appointments" />
      <CTASection />
    </>
  )
}
