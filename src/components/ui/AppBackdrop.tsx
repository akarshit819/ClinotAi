import { cn } from "@/lib/utils"

interface AppBackdropProps {
  className?: string
  variant?: "app" | "auth"
}

/**
 * Clinot ambient environment: two near-static light fields over the base
 * background. Opacity stays extremely low; the only motion is a slow
 * GPU-friendly drift (disabled entirely under prefers-reduced-motion by
 * the global rule). Decorative only — aria-hidden.
 */
export function AppBackdrop({ className, variant = "app" }: AppBackdropProps) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {variant === "app" ? (
        <>
          <div className="ambient-orb ambient-drift left-[-10%] top-[-20%] h-[480px] w-[480px] bg-primary-500/[0.05] blur-3xl dark:bg-primary-400/[0.07]" />
          <div className="ambient-orb right-[-12%] top-[30%] h-[560px] w-[560px] bg-primary-300/[0.04] blur-3xl dark:bg-primary-500/[0.05]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-500/20 to-transparent" />
        </>
      ) : (
        <>
          <div className="ambient-orb left-1/2 top-[-30%] h-[520px] w-[720px] -translate-x-1/2 bg-primary-500/[0.07] blur-3xl dark:bg-primary-400/[0.09]" />
          <div className="absolute inset-0 bg-grid opacity-40" />
        </>
      )}
    </div>
  )
}
