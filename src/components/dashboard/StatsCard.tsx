import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatsCardProps {
  title: string
  value: string | number
  change?: string
  icon: LucideIcon
  color?: "primary" | "emerald" | "amber" | "red" | "purple" | "neutral"
}

const colors = {
  primary: "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 ring-1 ring-primary-100/50 dark:ring-primary-800",
  emerald: "bg-success-50 dark:bg-success-900/30 text-success-600 dark:text-success-400 ring-1 ring-success-100/50 dark:ring-success-800",
  amber: "bg-warning-50 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400 ring-1 ring-warning-100/50 dark:ring-warning-800",
  red: "bg-danger-50 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400 ring-1 ring-danger-100/50 dark:ring-danger-800",
  purple: "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 ring-1 ring-purple-100/50 dark:ring-purple-800",
  neutral: "bg-navy-50 dark:bg-navy-800 text-navy-600 dark:text-navy-300 ring-1 ring-navy-100/50 dark:ring-navy-700",
}

export function StatsCard({ title, value, change, icon: Icon, color = "primary" }: StatsCardProps) {
  return (
    <div className="rounded-2xl border border-navy-100 dark:border-navy-700 bg-white dark:bg-navy-800 p-5 shadow-card dark:shadow-none transition-all duration-200 hover:shadow-card-hover dark:hover:border-navy-600">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", colors[color])}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {change && (
          <span className="text-2xs font-medium text-success-600 dark:text-success-300 bg-success-50 dark:bg-success-900/30 ring-1 ring-success-100/50 dark:ring-success-800 px-2 py-0.5 rounded-full">
            {change}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-navy-900 dark:text-navy-100 tracking-tight mb-0.5">{value}</div>
      <div className="text-xs text-navy-400 dark:text-navy-500 dark:text-navy-400 font-medium">{title}</div>
    </div>
  )
}
