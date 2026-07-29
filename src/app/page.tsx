import dynamic from "next/dynamic"
import { Navbar } from "@/components/landing/Navbar"
import { Hero } from "@/components/landing/Hero"

const SupportedPlatforms = dynamic(() => import("@/components/landing/SupportedPlatforms").then((m) => ({ default: m.SupportedPlatforms })))
const WhyClinot = dynamic(() => import("@/components/landing/WhyClinot").then((m) => ({ default: m.WhyClinot })))
const StopAnsweringSection = dynamic(() => import("@/components/landing/StopAnsweringSection").then((m) => ({ default: m.StopAnsweringSection })))
const AfterHoursSection = dynamic(() => import("@/components/landing/AfterHoursSection").then((m) => ({ default: m.AfterHoursSection })))
const HowItWorks = dynamic(() => import("@/components/landing/HowItWorks").then((m) => ({ default: m.HowItWorks })))
const FeaturesGrid = dynamic(() => import("@/components/landing/FeaturesGrid").then((m) => ({ default: m.FeaturesGrid })))
const BuiltAroundSection = dynamic(() => import("@/components/landing/BuiltAroundSection").then((m) => ({ default: m.BuiltAroundSection })))
const ROISection = dynamic(() => import("@/components/landing/ROISection").then((m) => ({ default: m.ROISection })))
const Testimonials = dynamic(() => import("@/components/landing/Testimonials").then((m) => ({ default: m.Testimonials })))
const TrustSection = dynamic(() => import("@/components/landing/TrustSection").then((m) => ({ default: m.TrustSection })))
const VisionSection = dynamic(() => import("@/components/landing/VisionSection").then((m) => ({ default: m.VisionSection })))
const DemoChat = dynamic(() => import("@/components/landing/DemoChat").then((m) => ({ default: m.DemoChat })))
const Pricing = dynamic(() => import("@/components/landing/Pricing").then((m) => ({ default: m.Pricing })))
const FAQSection = dynamic(() => import("@/components/landing/FAQ").then((m) => ({ default: m.FAQSection })))
const CTA = dynamic(() => import("@/components/landing/CTA").then((m) => ({ default: m.CTA })))
const Footer = dynamic(() => import("@/components/landing/Footer").then((m) => ({ default: m.Footer })))

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <SupportedPlatforms />
      <WhyClinot />
      <StopAnsweringSection />
      <AfterHoursSection />
      <HowItWorks />
      <FeaturesGrid />
      <BuiltAroundSection />
      <ROISection />
      <Testimonials />
      <TrustSection />
      <VisionSection />
      <DemoChat />
      <Pricing />
      <FAQSection />
      <CTA />
      <Footer />
    </>
  )
}
