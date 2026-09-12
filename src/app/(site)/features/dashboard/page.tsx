import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { SectionHeader } from "@/components/site/SectionHeader"
import { RelatedFeatures } from "@/components/site/FeatureCard"
import { CTASection } from "@/components/site/CTASection"
import { Reveal } from "@/components/site/Reveal"
import {
  CalendarCheck,
  Users,
  Inbox,
  BarChart3,
  BookOpen,
  Bell,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Clinic Dashboard",
  description:
    "Appointments, patients, conversations, and insights in one clean view — everything Clinot captures, ready for your team.",
}

const capabilities = [
  {
    icon: CalendarCheck,
    title: "Appointments at a glance",
    desc: "Pending, confirmed, and completed visits with patient details and statuses always current.",
  },
  {
    icon: Users,
    title: "Patient records",
    desc: "Contact details and history travel with every conversation — no re-asking, no lost context.",
  },
  {
    icon: Inbox,
    title: "Conversation inbox",
    desc: "Review, search, and take over any chat. Urgent cases surface immediately.",
  },
  {
    icon: BarChart3,
    title: "Practice insights",
    desc: "Today's inquiries, appointment requests, and new leads — know exactly what your front door is doing.",
  },
  {
    icon: BookOpen,
    title: "Your knowledge, editable",
    desc: "Services, pricing, hours, and FAQs stay accurate because you control them in one place.",
  },
  {
    icon: Bell,
    title: "Team notifications",
    desc: "New requests, urgent flags, and status changes reach the right people without delay.",
  },
]

export default function DashboardPage() {
  return (
    <>
      <PageHero
        badge="Dashboard"
        title="Your entire front desk, in one view"
        subtitle="Everything Clinot hears and books lands here — organized, searchable, and ready for your team's next move."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "Sign In", href: "/login" }}
      />

      <section aria-label="Capabilities" className="relative pb-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Capabilities"
            title="Clarity for busy teams"
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

      <section aria-label="Dashboard preview note" className="relative py-12">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <p className="text-sm text-navy-400 leading-relaxed">
              Already a Clinot customer?{" "}
              <a href="/login" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                Sign in to your dashboard
              </a>{" "}
              to see today&apos;s inquiries and appointments.
            </p>
          </Reveal>
        </div>
      </section>

      <RelatedFeatures currentSlug="dashboard" />
      <CTASection />
    </>
  )
}
