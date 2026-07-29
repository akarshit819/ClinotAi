import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-navy-100/50 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div className="lg:col-span-2">
            <Link href="/" className="text-base font-bold text-navy-900 tracking-tight mb-4 block">
              Clinot
            </Link>
            <p className="text-sm text-navy-400 max-w-md leading-relaxed mb-4">
              The 24/7 AI receptionist for healthcare. Turn more website visitors into patients by answering every inquiry instantly, even after hours.
            </p>
            <div className="flex items-center gap-3 text-xs text-navy-400">
              <span>HIPAA Ready</span>
              <span className="text-navy-200">|</span>
              <span>Encrypted</span>
              <span className="text-navy-200">|</span>
              <span>200+ Clinics</span>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-4">Product</h4>
            <ul className="space-y-2">
              <li><a href="#how-it-works" className="text-sm text-navy-500 hover:text-navy-900 transition-colors">How It Works</a></li>
              <li><a href="#features" className="text-sm text-navy-500 hover:text-navy-900 transition-colors">Features</a></li>
              <li><a href="#pricing" className="text-sm text-navy-500 hover:text-navy-900 transition-colors">Pricing</a></li>
              <li><a href="#faq" className="text-sm text-navy-500 hover:text-navy-900 transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-4">Company</h4>
            <ul className="space-y-2">
              <li><Link href="/login" className="text-sm text-navy-500 hover:text-navy-900 transition-colors">Sign In</Link></li>
              <li><a href="#demo-chat" className="text-sm text-navy-500 hover:text-navy-900 transition-colors">See Demo</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-navy-100/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
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
