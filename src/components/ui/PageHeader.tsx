import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

/**
 * Consistent page header: title + supporting description + optional
 * right-aligned actions. Single source of truth for page-level hierarchy.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("animate-fade-in", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-navy-900 dark:text-navy-100">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-navy-400 dark:text-navy-400">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
