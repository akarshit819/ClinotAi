"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/Badge"

const faqs = [
  {
    q: "Will Clinot replace my receptionist?",
    a: "No. Clinot handles routine questions so your team can focus on patient care. Your receptionist remains essential — they confirm appointments, handle complex situations, and provide the personal touch only they can.",
  },
  {
    q: "Will this actually help my practice grow?",
    a: "Clinot turns unanswered patient inquiries into booked appointments. Every question answered is a potential new patient. Every follow-up captured is a future appointment. Practices using Clinot see more appointments, fewer missed opportunities, and happier patients.",
  },
  {
    q: "Can patients book appointments on their own?",
    a: "Yes. Patients can request appointments anytime through natural conversation. Their request is sent to your team for confirmation. You stay in control — we never auto-confirm without your approval.",
  },
  {
    q: "Can I control what Clinot says?",
    a: "Completely. You provide the information about your services, pricing, hours, and policies. Clinot answers only from what you have approved. Update your information anytime and changes apply immediately.",
  },
  {
    q: "Is setup difficult?",
    a: "Most practices are live in under 30 minutes. We handle the configuration. You just tell us about your practice and we take care of the rest. No developers needed. No training required.",
  },
  {
    q: "Can I see Clinot before purchasing?",
    a: "Absolutely. You can explore our live demo clinic right now — no account needed. Click Book a Demo above to see the AI receptionist in action, experience how it handles appointments, and preview the dashboard. When you are ready, our team will set up your personalized clinic.",
  },
  {
    q: "Will Clinot work with my current systems?",
    a: "Yes. Clinot works alongside your website, your practice management software, and your scheduling. Everything stays exactly the same — Clinot simply helps you answer more patient questions and book more appointments.",
  },
  {
    q: "What if someone needs urgent medical care?",
    a: "Clinot is trained to identify urgent situations. It will provide emergency contact information and alert your team immediately. Clinot is not a medical device and does not provide medical advice. For life-threatening emergencies, patients should call 911.",
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-25 via-white to-gray-25 pointer-events-none" />
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="neutral" size="sm" className="mb-4">FAQ</Badge>
          <h2 className="section-title mb-4">Frequently asked questions</h2>
          <p className="section-subtitle">Everything you need to know about Clinot.</p>
        </div>

        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl border border-navy-100 bg-white shadow-card overflow-hidden transition-all duration-200"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex items-center justify-between w-full px-5 py-4 text-left"
              >
                <span className="text-sm font-semibold text-navy-900 pr-4">{faq.q}</span>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-navy-400 transition-transform duration-200",
                    openIndex === i && "rotate-90",
                  )}
                />
              </button>
              {openIndex === i && (
                <div className="px-5 pb-4 animate-slide-up">
                  <p className="text-xs text-navy-400 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
