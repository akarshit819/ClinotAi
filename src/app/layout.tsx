import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { Suspense } from "react"
import { GoogleAnalytics } from "@/components/GoogleAnalytics"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { getEnv } from "@/lib/env"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  preload: false,
  fallback: ["monospace"],
})

const APP_URL = getEnv("NEXT_PUBLIC_APP_URL", "https://clinot.ai")

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Clinot | 24/7 AI Receptionist for Healthcare Practices",
    template: "%s | Clinot",
  },
  description:
    "Clinot helps clinic owners reduce repetitive phone calls, capture every patient inquiry, and support patients 24/7 — without replacing your receptionist or software.",
  keywords: ["clinic receptionist", "medical appointment booking", "healthcare patient communication", "reduce phone calls", "after hours patient support", "AI receptionist", "dental clinic software"],
  authors: [{ name: "Clinot" }],
  category: "healthcare",
  openGraph: {
    title: "Clinot | 24/7 AI Receptionist for Healthcare Practices",
    description:
      "Handle routine patient questions automatically. Collect appointment requests. Support patients after hours. Your team focuses on care, not repetition.",
    type: "website",
    locale: "en_US",
    siteName: "Clinot",
    url: APP_URL,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Clinot AI Receptionist" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Clinot | 24/7 AI Receptionist for Healthcare Practices",
    description:
      "Handle routine patient questions automatically. Collect appointment requests. Support patients after hours. Your team focuses on care, not repetition.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  alternates: { canonical: APP_URL },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2463EB",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var p=window.location.pathname;if(p==="/"||p==="/pricing"||p==="/faq"||p==="/privacy"||p==="/terms"||!p.startsWith("/dashboard"))return;var t=localStorage.getItem("clinot-theme");if(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches)t="dark";if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})()`,
        }} />
      </head>
      <body className="min-h-screen bg-gray-25 font-sans antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Suspense fallback={null}><GoogleAnalytics /></Suspense>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Clinot",
              applicationCategory: "MedicalApplication",
              operatingSystem: "Web",
              description: "AI receptionist for healthcare practices. Answers patient questions, books appointments, and supports clinics 24/7.",
              offers: {
                "@type": "AggregateOffer",
                lowPrice: "49",
                highPrice: "Custom",
                priceCurrency: "USD",
                offerCount: "3",
              },
              author: {
                "@type": "Organization",
                name: "Clinot",
              },
            }),
          }}
        />
      </body>
    </html>
  )
}
