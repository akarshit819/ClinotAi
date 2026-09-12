import type { Metadata } from "next"
import Link from "next/link"
import { PageHero } from "@/components/site/PageHero"
import { Reveal } from "@/components/site/Reveal"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Clinot collects, uses, and protects clinic and patient information.",
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Reveal className="rounded-2xl border border-navy-100 bg-white shadow-card p-6 md:p-8">
      <h2 className="text-base font-bold text-navy-900 mb-3">{title}</h2>
      <div className="text-sm text-navy-500 leading-relaxed space-y-3">{children}</div>
    </Reveal>
  )
}

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        badge="Legal"
        title="Privacy Policy"
        subtitle="How we collect, use, and protect information. Last updated September 2026."
      />

      <section aria-label="Privacy policy" className="relative pb-20 md:pb-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-4">
          <Block title="Information we handle">
            <p>
              Clinot processes two kinds of information: clinic account information you provide
              (practice details, services, hours, team accounts) and patient conversation data
              created when patients message your clinic (messages, appointment requests, contact
              details they share).
            </p>
          </Block>

          <Block title="How information is used">
            <p>
              Information is used only to operate your clinic&apos;s AI receptionist: answering
              patient questions from your approved knowledge, collecting appointment requests, and
              showing activity in your dashboard. We do not sell personal information, and we do
              not train AI models on your patient data.
            </p>
          </Block>

          <Block title="How information is protected">
            <p>
              Each clinic&apos;s data is strictly separated — clinics can only ever access their
              own records. Account passwords are bcrypt-hashed, sessions use signed tokens, and
              credentials live in server environment configuration, never in code or AI prompts.
              Automated safeguards redact secrets such as API keys from AI outputs.
            </p>
          </Block>

          <Block title="Data retention and control">
            <p>
              Your conversation history and appointments remain available in your dashboard while
              your account is active. To request export or deletion of your clinic&apos;s data,
              contact us at{" "}
              <a href="mailto:sales@clinot.ai" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                sales@clinot.ai
              </a>
              .
            </p>
          </Block>

          <Block title="Questions">
            <p>
              For privacy questions, see our{" "}
              <Link href="/security" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                security practices
              </Link>{" "}
              or{" "}
              <Link href="/contact" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                contact us
              </Link>
              .
            </p>
          </Block>
        </div>
      </section>
    </>
  )
}
