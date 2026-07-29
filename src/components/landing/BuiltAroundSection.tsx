import { Badge } from "@/components/ui/Badge"
import { Users, Building2, Calendar, Phone, Shield, Stethoscope } from "lucide-react"

const items = [
  { icon: Users, label: "Your Reception Team — Clinot handles routine questions so they focus on patients." },
  { icon: Stethoscope, label: "Your Doctors — No interruptions during treatment. Clinot captures every inquiry." },
  { icon: Building2, label: "Your Practice Software — Clinot works alongside your existing systems." },
  { icon: Calendar, label: "Your Scheduling — Appointment requests arrive for your team to confirm." },
  { icon: Phone, label: "Your Phone System — Clinot answers online inquiries, your team handles calls." },
  { icon: Shield, label: "Your Data & Privacy — Patient information stays secure and private." },
]

export function BuiltAroundSection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden bg-white">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-25 via-white to-gray-25 pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="neutral" size="sm" className="mb-4">No Disruption</Badge>
          <h2 className="section-title mb-4">Clinot Supports Your Team. It Does Not Replace Them.</h2>
          <p className="section-subtitle">
            Your receptionist stays. Your doctors stay. Your software stays. Clinot simply handles the repetitive questions.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto mb-12">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-start gap-3 p-4 rounded-2xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover hover:border-navy-150 transition-all duration-200"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <span className="text-xs text-navy-500 leading-relaxed">{item.label}</span>
              </div>
            )
          })}
        </div>

        <div className="max-w-3xl mx-auto rounded-2xl bg-gradient-to-r from-primary-500 to-primary-700 p-8 text-center shadow-elevated">
          <p className="text-lg font-semibold text-white mb-2">Nothing Changes. Everything Gets Better.</p>
          <p className="text-sm text-primary-200 max-w-xl mx-auto">
            Your team keeps working as always. Your systems stay exactly the same. Clinot simply helps your clinic capture every patient inquiry and book more appointments.
          </p>
        </div>
      </div>
    </section>
  )
}
