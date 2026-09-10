import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "./Card"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * Consistent empty state: centered icon, title, supporting copy, optional
 * primary action. Replaces ad-hoc empty markup across pages.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={cn("animate-fade-in", className)}>
      <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:py-14">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
          <Icon className="h-6 w-6" />
        </div>
        <p className="text-base font-semibold tracking-tight text-navy-900 dark:text-navy-100">
          {title}
        </p>
        {description && (
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-navy-400 dark:text-navy-400">
            {description}
          </p>
        )}
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  )
}
