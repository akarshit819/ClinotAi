import type { Metadata } from "next"
import Link from "next/link"
import { PageHero } from "@/components/site/PageHero"
import { Reveal } from "@/components/site/Reveal"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing use of the Clinot platform.",
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Reveal className="rounded-2xl border border-navy-100 bg-white shadow-card p-6 md:p-8">
      <h2 className="text-base font-bold text-navy-900 mb-3">{title}</h2>
      <div className="text-sm text-navy-500 leading-relaxed space-y-3">{children}</div>
    </Reveal>
  )
}

export default function TermsPage() {
  return (
    <>
      <PageHero
        badge="Legal"
        title="Terms of Service"
        subtitle="The ground rules for using Clinot. Last updated September 2026."
      />

      <section aria-label="Terms of service" className="relative pb-20 md:pb-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-4">
          <Block title="What Clinot provides">
            <p>
              Clinot provides an AI receptionist for healthcare practices: answering routine
              patient questions from clinic-approved information, collecting appointment requests,
              and showing activity in a clinic dashboard. Final decisions — including appointment
              confirmations — always remain with your team.
            </p>
          </Block>

          <Block title="Not medical advice">
            <p>
              Clinot is not a medical device and does not provide medical advice, diagnoses, or
              treatment recommendations. Urgent situations are directed to emergency contacts and
              your team. Patients experiencing life-threatening emergencies should call 911.
            </p>
          </Block>

          <Block title="Your responsibilities">
            <p>
              You are responsible for keeping your clinic&apos;s information (services, hours,
              pricing, policies) accurate, for reviewing appointment requests before confirming
              them, and for safeguarding your team&apos;s account credentials.
            </p>
          </Block>

          <Block title="Plans and cancellation">
            <p>
              Paid plans are billed at a flat monthly rate with no setup fees and can be cancelled
              anytime from your billing settings. See{" "}
              <Link href="/pricing" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                pricing
              </Link>{" "}
              for current plans.
            </p>
          </Block>

          <Block title="Questions">
            <p>
              For questions about these terms,{" "}
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
