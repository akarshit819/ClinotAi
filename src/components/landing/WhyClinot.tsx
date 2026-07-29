import { Badge } from "@/components/ui/Badge"
import { XCircle, CheckCircle2 } from "lucide-react"

const reasons = [
  {
    problem: "Your receptionist spends hours every week repeating the same answers about hours, insurance, and pricing.",
    solution: "Clinot handles routine questions automatically. Your team focuses on patient care instead of repetitive answers.",
  },
  {
    problem: "Your clinic closes at 6 PM. But patients need help at 9 PM, 11 PM, and 2 AM.",
    solution: "Clinot stays on after your doors close. It answers questions, collects urgent information, and submits appointment requests.",
  },
  {
    problem: "You cannot answer phone calls while treating patients. Only one conversation at a time.",
    solution: "Clinot handles unlimited conversations simultaneously. Every inquiry is captured. Nobody gets forgotten.",
  },
]

export function WhyClinot() {
  return (
    <section id="why-clinot" className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-25 to-white pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="neutral" size="sm" className="mb-4">Why Clinot</Badge>
          <h2 className="section-title mb-4">The problem with being too busy to answer</h2>
          <p className="section-subtitle">
            Every missed call or unanswered question is a potential patient you never see.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {reasons.map((item, i) => (
            <div
              key={i}
              className="grid sm:grid-cols-2 gap-4 p-5 rounded-2xl border border-navy-100 bg-white shadow-card"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-500">
                  <XCircle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-navy-900 mb-1">Without Clinot</p>
                  <p className="text-xs text-navy-400 leading-relaxed">{item.problem}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-500">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-navy-900 mb-1">With Clinot</p>
                  <p className="text-xs text-navy-400 leading-relaxed">{item.solution}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
