import { PublicNavbar } from "@/components/site/PublicNavbar"
import { PublicFooter } from "@/components/site/PublicFooter"

/**
 * Public marketing layout. Navbar + footer only — the authenticated
 * dashboard and auth pages live outside this route group and are
 * completely untouched by the marketing redesign.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNavbar />
      <main>{children}</main>
      <PublicFooter />
    </>
  )
}
