import { cn } from "@/lib/utils"

interface BadgeProps {
  children: React.ReactNode
  variant?: "primary" | "success" | "warning" | "danger" | "neutral"
  className?: string
  size?: "sm" | "md"
}

const variants = {
  primary: "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-100 dark:border-primary-800",
  success: "bg-success-50 dark:bg-success-900/30 text-success-700 dark:text-success-300 border-success-100 dark:border-success-800",
  warning: "bg-warning-50 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 border-warning-100 dark:border-warning-800",
  danger: "bg-danger-50 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300 border-danger-100 dark:border-danger-800",
  neutral: "bg-navy-50 dark:bg-navy-800 text-navy-600 dark:text-navy-300 border-navy-100 dark:border-navy-700",
}

const sizes = {
  sm: "px-2 py-0.5 text-2xs",
  md: "px-2.5 py-1 text-xs",
}

export function Badge({ children, variant = "primary", size = "md", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  )
}
