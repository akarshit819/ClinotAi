"use client"

import { forwardRef } from "react"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger"
  size?: "sm" | "md" | "lg"
  loading?: boolean
  icon?: React.ReactNode
}

const variants = {
  primary:
    "bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 shadow-sm hover:shadow-glow",
  secondary:
    "bg-white dark:bg-navy-800 text-navy-700 dark:text-navy-200 border border-navy-150 dark:border-navy-600 hover:bg-navy-25 dark:hover:bg-navy-700 hover:border-navy-200 dark:hover:border-navy-500 active:bg-navy-50 dark:active:bg-navy-650",
  ghost: "text-navy-500 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-750 active:bg-navy-75 dark:active:bg-navy-700 hover:text-navy-700 dark:hover:text-navy-200",
  outline:
    "bg-transparent text-primary-600 dark:text-primary-400 border-2 border-primary-200 dark:border-primary-700 hover:bg-primary-25 dark:hover:bg-primary-900/20 hover:border-primary-300 dark:hover:border-primary-600 active:bg-primary-50",
  danger:
    "bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 shadow-sm",
}

const sizes = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3 text-base gap-2.5 rounded-xl",
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, icon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-semibold transition-all duration-150 ease-out-cubic",
          "active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25 focus-visible:ring-offset-2",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {children}
      </button>
    )
  },
)
Button.displayName = "Button"

export { Button }
