import { Badge } from "@/components/ui/Badge"
import { MessageSquare, CalendarCheck, Users, Clock, TrendingUp, HeartPulse } from "lucide-react"

const metrics = [
  { icon: MessageSquare, label: "Today's Inquiries", value: "Every patient question captured" },
  { icon: CalendarCheck, label: "Appointment Requests", value: "Ready for your team to review" },
  { icon: Users, label: "New Patient Leads", value: "Every opportunity tracked" },
  { icon: Clock, label: "Average Response Time", value: "Answered in seconds, not hours" },
  { icon: TrendingUp, label: "Missed Inquiries", value: "Know exactly what you are missing" },
  { icon: HeartPulse, label: "Emergency Alerts", value: "Never miss critical needs" },
]

export function ROISection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-25 to-white pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="neutral" size="sm" className="mb-4">Simple Metrics</Badge>
          <h2 className="section-title mb-4">Know Exactly How Your Clinic Is Performing</h2>
          <p className="section-subtitle">
            No complex dashboards. Just the metrics that matter — inquiries, appointments, response time, and patient leads.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {metrics.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-start gap-3 p-4 rounded-2xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover hover:border-navy-150 transition-all duration-200"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-navy-900 mb-0.5">{item.label}</div>
                  <div className="text-2xs text-navy-400">{item.value}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
