import { Shield, LockKeyhole, Database, Users, ClipboardList, MessageSquare } from "lucide-react"

const items = [
  { icon: Shield, title: "HIPAA Ready", desc: "Designed for HIPAA compliance. Your patient data stays private and secure." },
  { icon: LockKeyhole, title: "Encrypted Everywhere", desc: "AES-256 for data at rest. TLS 1.3 for data in transit." },
  { icon: Database, title: "Your Data Is Yours", desc: "We never train AI models on your patient data. Ever." },
  { icon: Users, title: "Role-Based Access", desc: "Granular permissions for your team. Full audit trail." },
  { icon: ClipboardList, title: "Complete Audit Trail", desc: "Every patient interaction is logged and searchable." },
  { icon: MessageSquare, title: "Dedicated Support", desc: "Enterprise support team. Average response under 30 minutes." },
]

export function TrustSection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden bg-white">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-25 via-white to-gray-25 pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="section-title mb-4">Enterprise-Grade Security & Compliance</h2>
          <p className="section-subtitle">
            Your patient data deserves the highest level of protection. Clinot is built for healthcare from the ground up.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="flex items-start gap-3 p-4 rounded-2xl border border-navy-100 bg-white shadow-card">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-navy-900 mb-0.5">{item.title}</div>
                  <p className="text-2xs text-navy-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
