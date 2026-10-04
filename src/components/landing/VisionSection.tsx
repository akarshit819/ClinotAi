import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

export function VisionSection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden bg-white">
      <div className="absolute inset-0 bg-gradient-radial from-primary-25/60 via-transparent to-transparent pointer-events-none" />
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <Badge variant="primary" size="sm" className="mb-5">The Vision</Badge>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-navy-900 tracking-tight leading-[1.1] mb-6 text-balance">
          Your Clinic Should Never Have to Say &quot;Call Us Back During Business Hours.&quot;
        </h2>
        <p className="text-base md:text-lg text-navy-400 max-w-3xl mx-auto mb-10 leading-relaxed">
          Your team works hard enough. They should not have to answer the same questions every day. They should not miss opportunities because the clinic is closed.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/signup">
            <Button size="lg">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/product">
            <Button size="lg" variant="secondary">
              Explore Product
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
