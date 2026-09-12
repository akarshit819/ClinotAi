import type { Metadata } from "next"
import { PageHero } from "@/components/site/PageHero"
import { CTASection } from "@/components/site/CTASection"
import { WhyClinot } from "@/components/landing/WhyClinot"
import { BuiltAroundSection } from "@/components/landing/BuiltAroundSection"
import { VisionSection } from "@/components/landing/VisionSection"

export const metadata: Metadata = {
  title: "About",
  description:
    "Why Clinot exists: clinics miss patients they could have helped. Our philosophy — AI that supports care teams instead of replacing them.",
}

export default function AboutPage() {
  return (
    <>
      <PageHero
        badge="About"
        title="Clinics shouldn't lose patients to silence"
        subtitle="Clinot exists for one reason: make sure every patient who reaches out gets an answer — and every care team gets its time back."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <WhyClinot />
      <BuiltAroundSection />
      <VisionSection />
      <CTASection
        title="Join the clinics that never miss an inquiry."
        subtitle="Set up in under 30 minutes. Your team keeps caring — Clinot handles the repetition."
      />
    </>
  )
}
