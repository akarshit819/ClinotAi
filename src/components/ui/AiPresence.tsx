import { cn } from "@/lib/utils"

interface AiPresenceProps {
  label?: string
  className?: string
}

/**
 * Clinot signature: a quiet "alive" indicator for AI activity. A small
 * solid dot breathing inside a soft radial halo — opacity-only motion,
 * no spinners, no sparkles. Use sparingly: system status, AI replies.
 */
export function AiPresence({ label, className }: AiPresenceProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="ai-presence inline-flex h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden="true" />
      {label && (
        <span className="text-2xs font-medium text-navy-400 dark:text-navy-500">{label}</span>
      )}
    </span>
  )
}
