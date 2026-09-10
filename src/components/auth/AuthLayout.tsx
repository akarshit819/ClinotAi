import { Bot } from "lucide-react"

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-50 via-white to-navy-25 p-4 dark:from-navy-950 dark:via-navy-900 dark:to-navy-950">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-500 shadow-glow">
            <Bot className="h-5 w-5 text-white" />
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
