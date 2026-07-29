import { CheckCircle, HelpCircle, ArrowRight, Sparkles, Shield, MessageSquare, Clock, Zap } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import Link from "next/link"
import { cn } from "@/lib/utils"

const plans = [
  {
    name: "Starter",
    price: "$49",
    period: "/month",
    description: "For independent practices ready to answer every patient online.",
    cta: "Book a Demo",
    popular: false,
    highlight: "Everything you need to get started.",
    conversations: "500 AI conversations per month",
    features: [
      "AI receptionist on your website 24/7",
      "Answers patient questions instantly",
      "Captures appointment requests",
      "Works with your existing website — no changes needed",
      "See every patient inquiry in one dashboard",
      "Email support",
    ],
  },
  {
    name: "Professional",
    price: "$99",
    period: "/month",
    description: "For growing clinics that want the complete AI front desk.",
    cta: "Get My AI Receptionist",
    popular: true,
    highlight: "Most popular for single-location clinics.",
    conversations: "2,000 AI conversations per month",
    features: [
      "Everything in Starter, plus:",
      "After-hours & weekend patient support",
      "Emergency detection with instant team alerts",
      "Your clinic logo and colors on the chat widget",
      "Calendar integration for appointment booking",
      "Full conversation history with search",
      "Patient inquiry insights and trends",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For healthcare groups, hospital networks, and multi-location clinics.",
    cta: "Contact Sales",
    popular: false,
    highlight: "Custom AI training. Dedicated support.",
    conversations: "Unlimited (fair use policy)",
    features: [
      "Everything in Professional, plus:",
      "Multi-location support",
      "Dedicated success manager",
      "Custom AI training on your clinic data",
      "Custom integrations with your systems",
      "Advanced security & HIPAA compliance",
      "API access for custom workflows",
      "SLA and uptime guarantee",
      "Priority phone & chat support",
    ],
  },
]

const trustItems = [
  { icon: Shield, text: "No Setup Fees — Cancel Anytime" },
  { icon: MessageSquare, text: "Setup in Minutes — Works With Your Website" },
  { icon: Clock, text: "Flat Monthly Rate — No Surprise Charges" },
]

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-25 via-white to-gray-25 pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="primary" size="sm" className="mb-4">Simple Pricing</Badge>
          <h2 className="section-title mb-4">Your AI Receptionist for Less Than a Coffee Run</h2>
          <p className="section-subtitle">
            Flat monthly rate. No hidden fees. No AI provider accounts needed.{" "}
            <span className="font-semibold text-navy-500">We handle everything.</span>
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative rounded-2xl border bg-white p-6 transition-all duration-200 flex flex-col",
                plan.popular
                  ? "border-primary-200 shadow-glow scale-[1.02] md:scale-105 ring-1 ring-primary-100"
                  : "border-navy-100 shadow-card hover:shadow-card-hover hover:border-navy-150 hover:-translate-y-0.5",
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge variant="primary" size="sm" className="px-3 py-1 gap-1 text-xs font-semibold">
                    <Sparkles className="h-3 w-3" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-sm font-semibold text-navy-900 mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-0.5">
                  <span className="text-3xl font-bold text-navy-900 tracking-tight">{plan.price}</span>
                  {plan.period && <span className="text-xs text-navy-400 font-medium">{plan.period}</span>}
                </div>
                <p className="text-xs text-navy-400 leading-relaxed mb-1">{plan.highlight}</p>
                <p className="text-[11px] text-navy-400 leading-relaxed">{plan.description}</p>
              </div>

              <div className="mb-4 p-3 rounded-xl bg-navy-25/50 border border-navy-75">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary-500 shrink-0" />
                  <span className="text-[11px] font-medium text-navy-600">{plan.conversations}</span>
                </div>
              </div>

              <Link href={plan.name === "Enterprise" ? "mailto:sales@clinot.ai" : "/signup"} className="block mb-5">
                <Button
                  variant={plan.popular ? "primary" : "secondary"}
                  className="w-full font-semibold"
                  size="md"
                >
                  {plan.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>

              <ul className="space-y-2.5 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    {feature === "Everything in Starter, plus:" || feature === "Everything in Professional, plus:" ? (
                      <HelpCircle className="h-4 w-4 text-navy-300 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-primary-500 shrink-0 mt-0.5" />
                    )}
                    <span className={cn(
                      "text-xs leading-relaxed",
                      feature.startsWith("Everything") ? "text-navy-400 font-medium" : "text-navy-500",
                    )}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 max-w-3xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {trustItems.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.text} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary-500 shrink-0" />
                  <span className="text-xs text-navy-500 font-medium">{item.text}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <div className="p-8 rounded-2xl border border-navy-100 bg-white shadow-card">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="flex-1">
                <h3 className="text-base font-bold text-navy-900 mb-2">
                  Need more than 2,000 conversations?
                </h3>
                <p className="text-sm text-navy-400 leading-relaxed">
                  If you are exceeding your plan limits, we will show upgrade recommendations —{" "}
                  <span className="font-semibold text-navy-500">no surprise charges</span>.
                  Enterprise plans scale with your practice.
                </p>
              </div>
              <Link href="mailto:sales@clinot.ai">
                <Button variant="outline" className="shrink-0">
                  Talk to Our Team
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
