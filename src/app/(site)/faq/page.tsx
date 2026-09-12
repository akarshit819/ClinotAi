import type { Metadata } from "next"
import { FAQSection } from "@/components/landing/FAQ"
import { CTASection } from "@/components/site/CTASection"

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Clinot: setup, control, appointments, compatibility, emergencies, and pricing.",
}

export default function FaqPage() {
  return (
    <div className="pt-16">
      <FAQSection />
      <CTASection
        title="Still have questions?"
        subtitle="Try the live demo clinic or send us a note — a human will reply."
      />
    </div>
  )
}
