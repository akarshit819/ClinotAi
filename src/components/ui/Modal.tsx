"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  labelledBy?: string
}

/**
 * Accessible modal: overlay click + Escape to dismiss, focus moved to the
 * dialog on open, subtle scale/fade entrance. Single replacement for all
 * ad-hoc confirmation dialogs.
 */
export function Modal({ open, onClose, title, description, children, footer, labelledBy = "modal-title" }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-2xl border border-navy-100 bg-white p-6 shadow-dialog",
          "dark:border-navy-700 dark:bg-navy-800 animate-scale-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 id={labelledBy} className="text-base font-semibold tracking-tight text-navy-900 dark:text-navy-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-navy-300 transition-colors hover:bg-navy-50 hover:text-navy-500 dark:hover:bg-navy-700 dark:hover:text-navy-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {description && (
          <p className="text-sm leading-relaxed text-navy-500 dark:text-navy-400">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-5 flex gap-2">{footer}</div>}
      </div>
    </div>
  )
}
