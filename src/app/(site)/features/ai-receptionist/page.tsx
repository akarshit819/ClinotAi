import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { SectionHeader } from "@/components/site/SectionHeader"
import { RelatedFeatures } from "@/components/site/FeatureCard"
import { CTASection } from "@/components/site/CTASection"
import { Reveal } from "@/components/site/Reveal"
import {
  MessageSquare,
  BookOpen,
  Globe,
  AlertTriangle,
  ShieldCheck,
  CalendarCheck,
} from "lucide-react"

export const metadata: Metadata = {
  title: "AI Receptionist",
  description:
    "Clinot answers routine patient questions instantly from your approved clinic knowledge — with strict clinic-only boundaries and emergency detection.",
}

const capabilities = [
  {
    icon: MessageSquare,
    title: "Instant answers, 24/7",
    desc: "Hours, services, insurance, pricing, directions — answered in under a minute, even at 2 AM.",
  },
  {
    icon: BookOpen,
    title: "Only from your approved knowledge",
    desc: "You provide services, pricing, hours, and policies. Clinot answers strictly from what you approved and updates apply immediately.",
  },
  {
    icon: ShieldCheck,
    title: "Stays on clinic topics",
    desc: "Unrelated requests get a polite redirect to clinic help — Clinot never drifts into a general chatbot.",
  },
  {
    icon: AlertTriangle,
    title: "Urgent situations flagged",
    desc: "Emergency language triggers instant emergency contacts and alerts your team right away.",
  },
  {
    icon: Globe,
    title: "Speaks your patients' language",
    desc: "Conversations follow the patient's language, including English, Spanish, and more.",
  },
  {
    icon: CalendarCheck,
    title: "Hands off to booking",
    desc: "When a question becomes an appointment need, Clinot starts collecting details for your team's confirmation.",
  },
]

export default function AiReceptionistPage() {
  return (
    <>
      <PageHero
        badge="AI Receptionist"
        title="Every routine question, answered instantly"
        subtitle="Clinot greets patients, answers from your approved clinic knowledge, and routes anything complex to your team."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <section aria-label="The problem" className="relative pb-16 md:pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <h2 className="text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-4 text-balance">
              Your team answers the same questions every single day
            </h2>
            <p className="text-base text-navy-400 leading-relaxed">
              Hours, insurance, pricing, directions — the routine repeats while patients wait on hold
              and after-hours inquiries go to voicemail. Clinot absorbs that repetition so your front
              desk can focus on patients in the chair.
            </p>
          </Reveal>
        </div>
      </section>

      <section aria-label="How the AI receptionist works" className="relative py-16 md:py-20 bg-white border-y border-navy-100/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="How it works"
            title="Conversation with guardrails"
            subtitle="Each message is classified, checked against your knowledge, and answered — or escalated."
          />
          <ol className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {[
              { step: "Step 1", title: "Understand", desc: "Clinot classifies what the patient needs: a question, an appointment, or urgent help." },
              { step: "Step 2", title: "Answer safely", desc: "Replies come only from your approved information. Unknowns are offered to your team, never invented." },
              { step: "Step 3", title: "Route onward", desc: "Appointment needs become structured requests. Urgencies alert your team. Everything lands in your inbox." },
            ].map((s, i) => (
              <Reveal as="li" key={s.title} delay={Math.min(i * 80, 160)} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
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
            title="Built for the front desk"
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

      <RelatedFeatures currentSlug="ai-receptionist" />
      <CTASection />
    </>
  )
}
