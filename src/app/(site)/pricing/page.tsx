import type { Metadata } from "next"
import { Pricing } from "@/components/landing/Pricing"
import { CTASection } from "@/components/site/CTASection"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple flat-rate pricing for your AI receptionist: Starter, Professional, and Enterprise. No setup fees, cancel anytime.",
}

export default function PricingPage() {
  return (
    <div className="pt-16">
      <Pricing />
      <CTASection
        title="Start answering every patient."
        subtitle="Pick the plan that fits your practice — upgrade, downgrade, or cancel anytime."
      />
    </div>
  )
}
