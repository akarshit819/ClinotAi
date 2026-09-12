import { AppBackdrop } from "@/components/ui/AppBackdrop"
import { ClinotLogo } from "@/components/brand/ClinotLogo"

interface AuthLayoutProps {
  eyebrow: string
  title: string
  children: React.ReactNode
}

/**
 * Shared auth shell: centered brand mark, headline, and elevated card.
 * Keeps login/signup visually identical without duplicating markup.
 */
export function AuthLayout({ eyebrow, title, children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-25 p-4 dark:bg-navy-950">
      <AppBackdrop variant="auth" />
      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl shadow-glow ring-1 ring-white/20">
            <ClinotLogo size={44} priority />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900 dark:text-navy-100">Clinot</h1>
          <p className="mt-1 text-sm text-navy-400 dark:text-navy-400">{eyebrow}</p>
        </div>

        <div className="rounded-2xl border border-navy-100 bg-white p-6 shadow-card dark:border-navy-700 dark:bg-navy-800 dark:shadow-none">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-navy-900 dark:text-navy-100">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  )
}
