import { Badge } from "@/components/ui/Badge"
import { Reveal } from "./Reveal"

interface SectionHeaderProps {
  badge?: string
  title: string
  subtitle?: string
  align?: "center" | "left"
}

/** Consistent section heading used across all public pages. */
export function SectionHeader({ badge, title, subtitle, align = "center" }: SectionHeaderProps) {
  const centered = align === "center"
  return (
    <Reveal className={`${centered ? "text-center mx-auto" : "text-left"} max-w-2xl mb-12 md:mb-14`}>
      {badge && (
        <Badge variant="neutral" size="sm" className="mb-4">{badge}</Badge>
      )}
      <h2 className="section-title mb-4 text-balance">{title}</h2>
      {subtitle && <p className={`section-subtitle ${centered ? "" : "mx-0"}`}>{subtitle}</p>}
    </Reveal>
  )
}
