import { Badge } from "@/components/ui/Badge"
import { MessageSquare, Clock, PhoneCall } from "lucide-react"

const commonQuestions = [
  "What are your opening hours?",
  "Do you accept insurance?",
  "How much does a check-up cost?",
  "Where are you located?",
  "Can I book an appointment?",
  "Do you offer emergency services?",
]

const outcomes = [
  {
    icon: Clock,
    value: "20+ hrs/week",
    label: "Hours Saved",
    description: "Time your team spends answering the same routine questions.",
    color: "text-primary-600 bg-primary-50 ring-primary-100/50",
  },
  {
    icon: PhoneCall,
    value: "Fewer",
    label: "Interruptions",
    description: "Your staff stays focused on patients, not repetitive answers.",
    color: "text-success-600 bg-success-50 ring-success-100/50",
  },
  {
    icon: MessageSquare,
    value: "Consistent",
    label: "Answers",
    description: "Every patient gets the same accurate information every time.",
    color: "text-warning-600 bg-warning-50 ring-warning-100/50",
  },
]

export function StopAnsweringSection() {
  return (
    <section id="stop-answering" className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-25 to-white pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="neutral" size="sm" className="mb-4">Repetitive Questions</Badge>
            <h2 className="section-title mb-4">Stop Answering the Same Questions Every Day</h2>
            <p className="section-subtitle">
              Your receptionist answers these questions dozens of times a day. Clinot handles them automatically.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-12">
            {commonQuestions.map((q) => (
              <div
                key={q}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-navy-100 bg-white shadow-card"
              >
                <MessageSquare className="h-4 w-4 text-navy-300 shrink-0" />
                <span className="text-xs text-navy-600">{q}</span>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {outcomes.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  className="p-5 rounded-2xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover hover:border-navy-150 transition-all duration-200"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl mb-4 ${item.color}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-lg font-bold text-navy-900 tracking-tight mb-0.5">{item.value}</div>
                  <div className="text-xs font-semibold text-navy-500 mb-1.5">{item.label}</div>
                  <p className="text-2xs text-navy-400 leading-relaxed">{item.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
