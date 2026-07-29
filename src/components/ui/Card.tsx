import { cn } from "@/lib/utils"

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  gradient?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

export function Card({ children, className, hover, gradient, onClick, style }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        "rounded-2xl border bg-white dark:bg-navy-800 transition-all duration-200 ease-out-cubic",
        "border-navy-100 dark:border-navy-700 shadow-card dark:shadow-none",
        hover && "hover:shadow-card-hover hover:border-navy-150 dark:hover:border-navy-600 hover:-translate-y-0.5",
        gradient && "gradient-border",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-6 pt-6 pb-4", className)}>{children}</div>
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-6 pb-6", className)}>{children}</div>
}
