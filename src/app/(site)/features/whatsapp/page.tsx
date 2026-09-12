import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { SectionHeader } from "@/components/site/SectionHeader"
import { RelatedFeatures } from "@/components/site/FeatureCard"
import { CTASection } from "@/components/site/CTASection"
import { Reveal } from "@/components/site/Reveal"
import { SupportedPlatforms } from "@/components/landing/SupportedPlatforms"
import {
  MessageCircle,
  Zap,
  RefreshCw,
  Sparkles,
} from "lucide-react"

export const metadata: Metadata = {
  title: "WhatsApp Integration",
  description:
    "Connect Clinot to WhatsApp to meet patients where they message — with instant replies, reliable delivery, and after-hours coverage.",
}

const capabilities = [
  {
    icon: Zap,
    title: "Replies in under a minute",
    desc: "Inbound WhatsApp messages are processed immediately — no queues, no business-hours-only bot.",
  },
  {
    icon: RefreshCw,
    title: "Reliable delivery",
    desc: "Outbound messages go through a durable queue with retries, so confirmations and updates actually arrive.",
  },
  {
    icon: Sparkles,
    title: "After-hours, handled",
    desc: "Evening and weekend WhatsApp inquiries get instant answers instead of silence until morning.",
  },
  {
    icon: MessageCircle,
    title: "One thread per patient",
    desc: "WhatsApp conversations join the same inbox as website chats, with full history your team can see.",
  },
]

export default function WhatsAppPage() {
  return (
    <>
      <PageHero
        badge="WhatsApp"
        title="Meet patients where they already message"
        subtitle="Connect WhatsApp once. Clinot handles the conversation — questions, appointments, and follow-ups."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <section aria-label="Capabilities" className="relative pb-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Capabilities"
            title="Messaging your patients already trust"
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {capabilities.map((c, i) => {
              const Icon = c.icon
              return (
                <Reveal key={c.title} delay={Math.min(i * 60, 180)} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
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

      <SupportedPlatforms />

      <RelatedFeatures currentSlug="whatsapp" />
      <CTASection />
    </>
  )
}
