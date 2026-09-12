import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { FeatureCard } from "@/components/site/FeatureCard"
import { SectionHeader } from "@/components/site/SectionHeader"
import { CTASection } from "@/components/site/CTASection"
import { FeaturesGrid } from "@/components/landing/FeaturesGrid"
import { Testimonials } from "@/components/landing/Testimonials"
import { FEATURES } from "@/components/site/site-content"

export const metadata: Metadata = {
  title: "Product overview",
  description:
    "The Clinot platform: AI receptionist, appointment management, patient communication, WhatsApp integration, and a clinic dashboard in one front desk.",
}

export default function ProductPage() {
  return (
    <>
      <PageHero
        badge="Product"
        title="The AI front desk for modern clinics"
        subtitle="Clinot combines instant patient communication, appointment capture, and a clean team dashboard — without replacing your website or software."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <section aria-label="Platform pillars" className="relative pb-4 md:pb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Platform"
            title="Everything a front desk does, always on"
            subtitle="Five connected capabilities. Each one useful alone, powerful together."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <FeatureCard key={f.slug} slug={f.slug} />
            ))}
          </div>
        </div>
      </section>

      <FeaturesGrid />
      <Testimonials />
      <CTASection />
    </>
  )
}
