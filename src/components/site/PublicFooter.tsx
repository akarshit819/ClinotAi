import Link from "next/link"
import { ClinotLogo } from "@/components/brand/ClinotLogo"

const columns: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
  {
    heading: "Product",
    links: [
      { label: "Product overview", href: "/product" },
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Security", href: "/security" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Try the chat", href: "/chat" },
      { label: "Get started", href: "/signup" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
]

export function PublicFooter() {
  return (
    <footer className="border-t border-navy-100/50 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-10 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4" aria-label="Clinot home">
              <ClinotLogo size={32} />
              <span className="text-base font-bold text-navy-900 tracking-tight">Clinot</span>
            </Link>
            <p className="text-sm text-navy-400 max-w-sm leading-relaxed mb-4">
              The 24/7 AI receptionist for healthcare. Turn more website visitors into patients by answering every inquiry instantly, even after hours.
            </p>
            <div className="flex items-center gap-3 text-xs text-navy-400">
              <span>HIPAA Ready</span>
              <span className="text-navy-200" aria-hidden="true">|</span>
              <span>Encrypted</span>
              <span className="text-navy-200" aria-hidden="true">|</span>
              <span>200+ Clinics</span>
            </div>
          </div>
          {columns.map((col) => (
            <nav key={col.heading} aria-label={`Footer — ${col.heading}`}>
              <h3 className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-4">
                {col.heading}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-navy-500 hover:text-navy-900 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-navy-100/50 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-navy-400">&copy; {new Date().getFullYear()} Clinot. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-navy-400 hover:text-navy-600 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-xs text-navy-400 hover:text-navy-600 transition-colors">Terms of Service</Link>
            <Link href="/login" className="text-xs text-navy-400 hover:text-navy-600 transition-colors">Sign In</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
