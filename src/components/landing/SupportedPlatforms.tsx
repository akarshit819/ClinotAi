import { Badge } from "@/components/ui/Badge"
import { Globe, Monitor, Layout, ShoppingCart, Atom, FileJson, Code2, Laptop, Smartphone } from "lucide-react"

const platforms = [
  { name: "WordPress", icon: Globe },
  { name: "Webflow", icon: Layout },
  { name: "Wix", icon: Monitor },
  { name: "Squarespace", icon: Layout },
  { name: "Shopify", icon: ShoppingCart },
  { name: "React", icon: Atom },
  { name: "Next.js", icon: FileJson },
  { name: "Vue", icon: Code2 },
  { name: "Angular", icon: Code2 },
  { name: "Laravel", icon: Laptop },
  { name: "PHP", icon: Code2 },
  { name: "ASP.NET", icon: Monitor },
  { name: "Static HTML", icon: Globe },
  { name: "Any Website", icon: Smartphone },
]

export function SupportedPlatforms() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-25 to-white pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="neutral" size="sm" className="mb-4">Works With Your Website</Badge>
          <h2 className="section-title mb-4">No Matter What Platform You Use</h2>
          <p className="section-subtitle">
            Clinot works with every major website platform. Your site stays exactly as it is.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 max-w-5xl mx-auto">
          {platforms.map((p) => {
            const Icon = p.icon
            return (
              <div
                key={p.name}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover hover:border-navy-150 transition-all duration-200"
              >
                <Icon className="h-5 w-5 text-navy-400" />
                <span className="text-xs font-medium text-navy-500 text-center">{p.name}</span>
              </div>
            )
          })}
        </div>

        <div className="max-w-xl mx-auto mt-12 p-5 rounded-2xl border border-navy-100 bg-white shadow-sm text-center">
          <p className="text-sm font-medium text-navy-700 mb-0.5">Your website stays exactly the same.</p>
          <p className="text-xs text-navy-400">No redesign. No migration. No downtime.</p>
        </div>
      </div>
    </section>
  )
}
