import { Badge } from "@/components/ui/Badge"
import { XCircle, CheckCircle2 } from "lucide-react"

export function AfterHoursSection() {
  return (
    <section id="after-hours" className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-primary-25/20 to-white pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="primary" size="sm" className="mb-4">After Hours</Badge>
          <h2 className="section-title mb-4">What Happens After Your Clinic Closes?</h2>
          <p className="section-subtitle">
            Patients do not stop needing help when your doors close. The difference is whether anyone is there to answer.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="p-6 rounded-2xl border border-danger-100 bg-danger-50/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger-100 text-danger-600">
                <XCircle className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-danger-700">Without Clinot</span>
            </div>
            <ul className="space-y-3">
              {[
                "After-hours calls go to voicemail or unanswered",
                "Potential patients call competitor clinics in the morning",
                "Emergency situations go un-triaged until morning",
                "No record of who tried to reach you overnight",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs text-navy-500">
                  <span className="text-danger-400 mt-0.5">✕</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-6 rounded-2xl border border-success-100 bg-success-50/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success-100 text-success-600">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-success-700">With Clinot</span>
            </div>
            <ul className="space-y-3">
              {[
                "Patients get instant answers 24/7",
                "Appointment requests collected overnight",
                "Urgent cases flagged for morning review",
                "Every inquiry captured with full context",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs text-navy-500">
                  <span className="text-success-500 mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-xs text-navy-400 text-center mt-6 max-w-lg mx-auto">
          Clinot never auto-confirms appointments or makes medical decisions. Every request is reviewed by your team before confirmation.
        </p>
      </div>
    </section>
  )
}
