"use client"

import { cn } from "@/lib/utils"

interface QuickRepliesProps {
  suggestions: string[]
  onSelect: (text: string) => void
  className?: string
}

export function QuickReplies({ suggestions, onSelect, className }: QuickRepliesProps) {
  if (!suggestions.length) return null

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {suggestions.map((text) => (
        <button
          key={text}
          onClick={() => onSelect(text)}
          className="px-3.5 py-2 text-xs font-medium rounded-full border border-navy-200 bg-white text-navy-600 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-600 transition-all duration-200 active:scale-95"
        >
          {text}
        </button>
      ))}
    </div>
  )
}
