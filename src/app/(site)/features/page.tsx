import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { FeatureCard } from "@/components/site/FeatureCard"
import { CTASection } from "@/components/site/CTASection"
import { FEATURES } from "@/components/site/site-content"

export const metadata: Metadata = {
  title: "Features",
  description:
    "Browse everything Clinot does: AI receptionist, appointments, patient communication, WhatsApp integration, and the clinic dashboard.",
}

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        badge="Features"
        title="Everything Clinot does, in one place"
        subtitle="Pick any capability to see how it works, what problems it solves, and how it fits your clinic's day."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <section aria-label="Feature directory" className="relative pb-20 md:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <FeatureCard key={f.slug} slug={f.slug} />
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}
