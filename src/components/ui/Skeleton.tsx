import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-skeleton rounded-lg bg-navy-75 dark:bg-navy-750", className)}
      aria-hidden="true"
    />
  )
}
