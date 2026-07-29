import { Badge } from "@/components/ui/Badge"
import { UserPlus, Building2, CheckCircle2, MessageSquare, Bell, Sparkles } from "lucide-react"

const steps = [
  {
    icon: UserPlus,
    title: "Create Your Clinot Account",
    description: "Sign up in seconds. Tell us about your practice — services, doctors, hours, insurance, languages, and appointment preferences.",
  },
  {
    icon: Building2,
    title: "Verify Your Clinic",
    description: "We confirm your clinic details. Your information stays accurate and up to date.",
  },
  {
    icon: CheckCircle2,
    title: "Connect Your Website",
    description: "Simple guided setup. Your website stays exactly the same — no technical work needed. We handle everything.",
  },
  {
    icon: MessageSquare,
    title: "Patients Start Chatting",
    description: "Clinot answers instantly. Collects appointment requests. Qualifies inquiries. Detects emergencies. All without your team lifting a finger.",
  },
  {
    icon: Bell,
    title: "Your Clinic Receives a Notification",
    description: "Every inquiry arrives in your dashboard. Appointment requests, patient details, and conversation summaries — all organized for your team.",
  },
  {
    icon: Sparkles,
    title: "Your Team Decides What Happens Next",
    description: "You stay in complete control. Confirm appointments. Follow up on leads. Handle urgent cases. Clinot handles the routine, you handle the care.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-25 to-white pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="neutral" size="sm" className="mb-4">How It Works</Badge>
          <h2 className="section-title mb-4">Your AI Receptionist in Under 30 Minutes</h2>
          <p className="section-subtitle">
            Faster than onboarding a new team member. No training needed.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <div
                key={step.title}
                className="relative p-5 rounded-2xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover hover:border-navy-150 transition-all duration-200 ease-out-cubic"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-medium text-navy-400">Step {i + 1}</span>
                </div>
                <h3 className="text-sm font-semibold text-navy-900 mb-1.5">{step.title}</h3>
                <p className="text-xs text-navy-400 leading-relaxed">{step.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
