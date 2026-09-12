import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { SectionHeader } from "@/components/site/SectionHeader"
import { HowItWorksFlow } from "@/components/site/HowItWorksFlow"
import { CTASection } from "@/components/site/CTASection"
import { HowItWorks } from "@/components/landing/HowItWorks"

export const metadata: Metadata = {
  title: "How it works",
  description:
    "From patient message to confirmed appointment: see exactly how Clinot receives, understands, answers, and hands off to your team.",
}

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        badge="How it works"
        title="From message to appointment, automatically"
        subtitle="Six stages carry every patient inquiry from first hello to a confirmed visit — with your team in control throughout."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <section aria-label="The Clinot pipeline" className="relative pb-20 md:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Pipeline"
            title="What happens to every message"
            subtitle="The same path powers website chat and WhatsApp — no separate systems to manage."
          />
          <HowItWorksFlow />
        </div>
      </section>

      <HowItWorks />
      <CTASection />
    </>
  )
}
