import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { SectionHeader } from "@/components/site/SectionHeader"
import { RelatedFeatures } from "@/components/site/FeatureCard"
import { CTASection } from "@/components/site/CTASection"
import { Reveal } from "@/components/site/Reveal"
import {
  Inbox,
  Clock,
  Sparkles,
  AlertTriangle,
  Globe,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Patient Communication",
  description:
    "Every patient inquiry captured in one inbox — routine questions answered instantly, urgent ones flagged, nothing lost after hours.",
}

const capabilities = [
  {
    icon: Inbox,
    title: "One shared inbox",
    desc: "Website chats and WhatsApp messages arrive in a single conversation view your whole team can follow.",
  },
  {
    icon: Clock,
    title: "Full conversation history",
    desc: "Every turn is stored and searchable, so anyone on your team can pick up exactly where Clinot left off.",
  },
  {
    icon: Sparkles,
    title: "After-hours coverage",
    desc: "Evening and weekend inquiries get instant answers instead of voicemail — and become morning follow-ups.",
  },
  {
    icon: AlertTriangle,
    title: "Urgency escalation",
    desc: "Emergency language routes to emergency contacts and alerts your team immediately.",
  },
  {
    icon: Globe,
    title: "Patients' own language",
    desc: "Clinot follows the patient's language, so more of your community can reach you comfortably.",
  },
]

export default function PatientCommunicationPage() {
  return (
    <>
      <PageHero
        badge="Patient Communication"
        title="Stop losing patients to unanswered messages"
        subtitle="Clinot answers the routine instantly, flags the urgent, and files everything where your team can act on it."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <section aria-label="The problem" className="relative pb-16 md:pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <h2 className="text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-4 text-balance">
              Every unanswered message is a patient going elsewhere
            </h2>
            <p className="text-base text-navy-400 leading-relaxed">
              Calls during procedures, messages after closing, weekend questions — without coverage,
              intent evaporates. Clinot makes sure someone always answers.
            </p>
          </Reveal>
        </div>
      </section>

      <section aria-label="Capabilities" className="relative py-16 md:py-20 bg-white border-y border-navy-100/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Capabilities"
            title="Coverage your team can trust"
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

      <RelatedFeatures currentSlug="patient-communication" />
      <CTASection />
    </>
  )
}
