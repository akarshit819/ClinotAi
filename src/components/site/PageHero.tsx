import Link from "next/link"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"

interface PageHeroProps {
  badge: string
  title: ReactNode
  subtitle: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
}

/**
 * Compact marketing hero shared by every public page. Deliberately
 * restrained: one badge, one headline, one paragraph, two actions.
 */
export function PageHero({ badge, title, subtitle, primaryCta, secondaryCta }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 md:pt-40 md:pb-20">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-25 via-primary-25/30 to-gray-25 pointer-events-none" aria-hidden="true" />
      <div className="absolute inset-0 bg-grid opacity-[0.4]" aria-hidden="true" />
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="flex justify-center mb-6 animate-fade-in">
          <Badge variant="primary" size="sm">{badge}</Badge>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-navy-900 tracking-tight leading-[1.1] mb-5 animate-fade-in-up text-balance">
          {title}
        </h1>
        <p className="text-base md:text-lg text-navy-400 max-w-2xl mx-auto mb-8 animate-fade-in-up leading-relaxed text-balance" style={{ animationDelay: "0.1s" }}>
          {subtitle}
        </p>
        {(primaryCta || secondaryCta) && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            {primaryCta && (
              <Link href={primaryCta.href}>
                <Button size="lg" className="w-full sm:w-auto">
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
            {secondaryCta && (
              <Link href={secondaryCta.href}>
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  {secondaryCta.label}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
