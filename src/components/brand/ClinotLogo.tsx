"use client"

import { useState } from "react"
import Image from "next/image"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Canonical Clinot AI brand asset. ONE file, referenced everywhere:
 *
 *   public/brand/clinot-logo.png  (official blue/purple glass mark)
 *
 * centralized here so the whole product — marketing site, auth,
 * dashboard, chat, widget, emails, favicon, manifest — renders the
 * exact same symbol. Aspect ratio is always preserved (square).
 *
 * Size system: xs 16 (inline) · sm 20–24 (nav/sidebar) · md 32–44
 * (auth/headers) · lg 48–72 (empty states) · hero 96+ (marketing).
 * Pass an exact pixel number for anything in between.
 */
export const CLINOT_LOGO_SRC = "/brand/clinot-logo.png"

const PRESET_SIZES = {
  xs: 16,
  sm: 24,
  md: 36,
  lg: 56,
  xl: 72,
  hero: 112,
} as const

export type ClinotLogoSize = keyof typeof PRESET_SIZES | number

interface ClinotLogoProps {
  size?: ClinotLogoSize
  className?: string
  /** Above-the-fold brand marks (navbar, hero) should prioritize. */
  priority?: boolean
  /** Rounded corner treatment. Artwork stays undistorted. */
  rounded?: string
}

export function ClinotLogo({ size = "md", className, priority = false, rounded = "rounded-[24%]" }: ClinotLogoProps) {
  const px = typeof size === "number" ? size : PRESET_SIZES[size]
  const [missing, setMissing] = useState(false)

  // TEMPORARY missing-asset guard: renders a neutral tile ONLY when
  // /brand/clinot-logo.png is absent. Delete this branch once the
  // official artwork is in place — it must never ship as branding.
  if (missing) {
    return (
      <span
        role="img"
        aria-label="Clinot AI logo"
        style={{ width: px, height: px }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 text-white",
          rounded,
          className,
        )}
      >
        <Bot style={{ width: px * 0.55, height: px * 0.55 }} />
      </span>
    )
  }

  return (
    <Image
      src={CLINOT_LOGO_SRC}
      alt="Clinot AI logo"
      width={px}
      height={px}
      priority={priority}
      onError={() => setMissing(true)}
      className={cn("shrink-0 select-none", rounded, className)}
      draggable={false}
    />
  )
}
