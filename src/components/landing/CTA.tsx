import { Button } from "@/components/ui/Button"
import { ArrowRight } from "lucide-react"

export function CTA() {
  return (
    <section className="py-24 md:py-32 bg-white">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="relative p-8 md:p-12 rounded-3xl bg-gradient-to-br from-primary-500 to-primary-700 overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-[0.08]" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              Ready to Turn More Visitors Into Patients?
            </h2>
            <p className="text-base md:text-lg text-white/70 max-w-2xl mx-auto mb-8 leading-relaxed">
              Join 200+ healthcare practices using Clinot to answer patients 24/7, capture every lead, and grow revenue — without replacing your website or software.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="#demo-chat">
                <Button
                  size="lg"
                  className="bg-white text-primary-600 hover:bg-white/90 shadow-sm"
                >
                  Book a Demo
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="#demo-chat">
                <Button
                  size="lg"
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                >
                  See It Live
                </Button>
              </a>
            </div>
            <p className="text-sm text-white/50 mt-4">No setup fees · Cancel anytime · Works with your website</p>
          </div>
        </div>
      </div>
    </section>
  )
}
