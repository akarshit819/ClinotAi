import type { Metadata } from "next"
import { DemoChat } from "@/components/landing/DemoChat"
import { CTASection } from "@/components/site/CTASection"

export const metadata: Metadata = {
  title: "Live demo",
  description:
    "Talk to Clinot yourself in a live demo clinic — ask about hours, services, insurance, or request an appointment. No account needed.",
}

export default function DemoPage() {
  return (
    <div className="pt-16">
      <DemoChat />
      <CTASection
        title="Like what you saw?"
        subtitle="Your clinic could answer like this in under 30 minutes."
      />
    </div>
  )
}
