import type { Metadata } from "next"
import Link from "next/link"
import { PageHero } from "@/components/site/PageHero"
import { SectionHeader } from "@/components/site/SectionHeader"
import { CTASection } from "@/components/site/CTASection"
import { Reveal } from "@/components/site/Reveal"
import { TrustSection } from "@/components/landing/TrustSection"
import { LockKeyhole, Database, ShieldCheck, ClipboardList } from "lucide-react"

export const metadata: Metadata = {
  title: "Security & Privacy",
  description:
    "How Clinot protects clinic and patient data: scoped access, hashed credentials, secret protection, and strict AI boundaries.",
}

const practices = [
  {
    icon: Database,
    title: "Clinic data stays separated",
    desc: "Every record — conversations, appointments, knowledge — is scoped to its clinic. Clinics can never see each other's data.",
  },
  {
    icon: LockKeyhole,
    title: "Credentials handled carefully",
    desc: "Passwords are bcrypt-hashed, sessions use signed tokens, and secrets live in environment configuration — never in code or prompts.",
  },
  {
    icon: ShieldCheck,
    title: "The AI stays in its lane",
    desc: "A deterministic application boundary keeps Clinot on clinic topics. Internal instructions, prompts, and keys never reach patients.",
  },
  {
    icon: ClipboardList,
    title: "Reviewable by design",
    desc: "Full conversation history and an audit trail mean your team can always see exactly what was said and decided.",
  },
]

export default function SecurityPage() {
  return (
    <>
      <PageHero
        badge="Security"
        title="Patient data deserves the highest protection"
        subtitle="Clinot is built for healthcare from the ground up — scoped data, careful credentials, and AI that can't wander."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "Contact Us", href: "/contact" }}
      />

      <TrustSection />

      <section aria-label="Security practices" className="relative py-16 md:py-20 bg-white border-t border-navy-100/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Practices"
            title="How protection works in practice"
          />
          <div className="grid sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {practices.map((p, i) => {
              const Icon = p.icon
              return (
                <Reveal key={p.title} delay={Math.min(i * 60, 180)} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 mb-4">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-navy-900 mb-1.5">{p.title}</h3>
                  <p className="text-xs text-navy-400 leading-relaxed">{p.desc}</p>
                </Reveal>
              )
            })}
          </div>
          <Reveal className="text-center mt-10">
            <p className="text-sm text-navy-400">
              Questions about our practices? Read our{" "}
              <Link href="/privacy" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">Privacy Policy</Link>
              {" "}or{" "}
              <Link href="/contact" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">talk to us</Link>.
            </p>
          </Reveal>
        </div>
      </section>

      <CTASection />
    </>
  )
}
