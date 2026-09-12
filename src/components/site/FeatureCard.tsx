import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Reveal } from "./Reveal"
import { FEATURES } from "./site-content"

/** Interactive product directory card used on home, /features and related lists. */
export function FeatureCard({ slug }: { slug: string }) {
  const feature = FEATURES.find((f) => f.slug === slug)
  if (!feature) return null
  const Icon = feature.icon
  return (
    <Reveal>
      <Link
        href={feature.href}
        className="group flex h-full flex-col p-6 rounded-2xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover hover:border-navy-150 hover:-translate-y-1 transition-all duration-200 ease-out-cubic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25"
        aria-label={`${feature.title} — learn more`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 mb-4 group-hover:bg-primary-100 group-hover:text-primary-700 transition-colors duration-200">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-base font-semibold text-navy-900 mb-1.5">{feature.title}</h3>
        <p className="text-sm text-navy-400 leading-relaxed flex-1">{feature.short}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 group-hover:gap-2.5 transition-all duration-200">
          Learn more
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </Reveal>
  )
}

/** "Keep exploring" list shown at the foot of every feature detail page. */
export function RelatedFeatures({ currentSlug }: { currentSlug: string }) {
  const related = FEATURES.filter((f) => f.slug !== currentSlug)
  return (
    <section className="py-16 md:py-20 bg-white" aria-label="Related features">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl md:text-3xl font-bold text-navy-900 tracking-tight mb-8 text-center">
          Keep exploring
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {related.map((f) => (
            <FeatureCard key={f.slug} slug={f.slug} />
          ))}
        </div>
      </div>
    </section>
  )
}
