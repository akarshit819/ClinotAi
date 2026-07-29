"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect } from "react"

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || ""

export function GoogleAnalytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!GA_ID || typeof window === "undefined" || typeof (window as any).gtag === "undefined") return
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "")
    ;(window as any).gtag("config", GA_ID, { page_path: url })
  }, [pathname, searchParams])

  if (!GA_ID) return null

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${GA_ID}',{page_path:window.location.pathname});`,
        }}
      />
    </>
  )
}
