import { PhoneCall, Clock, MessageSquare, Users, HeartPulse, Shield, TrendingUp, Palette, Globe } from "lucide-react"

const features = [
  {
    icon: PhoneCall,
    title: "Fewer Repetitive Phone Calls",
    description: "Your team no longer answers the same questions about hours, insurance, and pricing all day. Clinot handles the routine inquiries automatically.",
  },
  {
    icon: Clock,
    title: "Your Clinic Stays Open 24/7",
    description: "Patients get help even when your doors are closed. No missed calls. No lost opportunities. No after-hours interruptions for your staff.",
  },
  {
    icon: MessageSquare,
    title: "Collect Appointment Requests Automatically",
    description: "Patients request appointments through conversation. Requests reach your team for confirmation. Your schedule stays in your control.",
  },
  {
    icon: Users,
    title: "Reduce Receptionist Workload",
    description: "Your front desk handles fewer interruptions and more meaningful patient interactions. Clinot manages the repetitive conversations.",
  },
  {
    icon: HeartPulse,
    title: "Urgent Cases Flagged Immediately",
    description: "When a patient describes an urgent situation, Clinot alerts your team and provides emergency contact information right away.",
  },
  {
    icon: Shield,
    title: "Doctor Always Stays in Control",
    description: "Clinot never auto-confirms appointments or makes medical decisions. Every request is reviewed by your team before anything is confirmed.",
  },
  {
    icon: TrendingUp,
    title: "Know How Many Patients Your Website Is Getting",
    description: "See today's inquiries, appointment requests, missed inquiries, and new patient leads — all in one clean view.",
  },
  {
    icon: Palette,
    title: "Matches Your Clinic Brand",
    description: "Customize the chat to match your clinic colors and communication style. Patients feel like they are talking to your team.",
  },
  {
    icon: Globe,
    title: "Multi-Language Patient Support",
    description: "Communicate with patients in their preferred language. Clinot handles conversations in English, Spanish, and more.",
  },
]

export function FeaturesGrid() {
  return (
    <section id="features" className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-25 via-white to-gray-25 pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="section-title mb-4">Help more patients without adding more staff</h2>
          <p className="section-subtitle">
            Clinot handles the routine so your team can focus on patient care.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature, i) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="group p-5 rounded-2xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover hover:border-navy-150 hover:-translate-y-0.5 transition-all duration-200 ease-out-cubic"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 mb-4 group-hover:bg-primary-100 group-hover:text-primary-700 transition-colors duration-200">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="text-sm font-semibold text-navy-900 mb-1.5">{feature.title}</h3>
                <p className="text-xs text-navy-400 leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
