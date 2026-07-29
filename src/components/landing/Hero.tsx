import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { ArrowRight, Play } from "lucide-react"

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-25 via-primary-25/30 to-gray-25 pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-[0.4]" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-primary-500/4 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-primary-300/4 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-400/3 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-8 animate-fade-in">
            <Badge variant="primary" size="md" className="text-xs px-3 py-1 gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Trusted by 200+ clinics
            </Badge>
          </div>

          <h1 className="text-[2.25rem] sm:text-5xl md:text-6xl lg:text-7xl font-bold text-navy-900 tracking-tight leading-[1.08] mb-6 animate-fade-in-up text-balance">
            Never Miss Another Patient Inquiry.
          </h1>

          <p className="text-base md:text-lg text-navy-400 max-w-3xl mx-auto mb-10 animate-fade-in-up leading-relaxed text-balance" style={{ animationDelay: "0.1s" }}>
            Every unanswered question is a missed opportunity. Clinot acts as your AI Receptionist, answering patients instantly, collecting appointment requests, and helping your team respond faster — 24 hours a day.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up mb-16" style={{ animationDelay: "0.2s" }}>
            <a href="#demo-chat">
              <Button size="lg" className="w-full sm:w-auto">
                Book a Demo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <a href="#how-it-works">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                <Play className="h-4 w-4" />
                See Clinot in Action
              </Button>
            </a>
          </div>

          <div className="flex items-center justify-center gap-8 md:gap-16 flex-wrap animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
            {[
              { stat: "24/7", label: "Available" },
              { stat: "Never", label: "Miss an Inquiry" },
              { stat: "Works With", label: "Your Existing Workflow" },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-primary-600 tracking-tight">{item.stat}</div>
                <div className="text-sm text-navy-400 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
