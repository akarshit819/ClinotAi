import Link from "next/link"
import { Button } from "@/components/ui/Button"
import { ArrowRight } from "lucide-react"
import { Reveal } from "./Reveal"

interface CTASectionProps {
  title?: string
  subtitle?: string
  note?: string
}

/** Shared final call-to-action. One voice, every page. */
export function CTASection({
  title = "Bring AI-powered assistance to your clinic.",
  subtitle = "Answer every patient inquiry instantly, capture more appointments, and let your team focus on care.",
  note = "No setup fees · Cancel anytime · Works with your website",
}: CTASectionProps) {
  return (
    <section className="py-20 md:py-28 bg-white" aria-label="Get started">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Reveal className="relative p-8 md:p-12 rounded-3xl bg-gradient-to-br from-primary-500 to-primary-700 overflow-hidden text-center">
          <div className="absolute inset-0 bg-grid opacity-[0.08]" aria-hidden="true" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight text-balance">
              {title}
            </h2>
            <p className="text-base md:text-lg text-white/70 max-w-2xl mx-auto mb-8 leading-relaxed">
              {subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/signup">
                <Button size="lg" className="w-full sm:w-auto bg-white text-primary-600 hover:bg-white/90 shadow-sm">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/product">
                <Button size="lg" variant="ghost" className="w-full sm:w-auto text-white hover:bg-white/10">
                  Explore Product
                </Button>
              </Link>
            </div>
            <p className="text-sm text-white/50 mt-4">{note}</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
