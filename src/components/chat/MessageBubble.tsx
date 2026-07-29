"use client"

import { Bot, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface MessageBubbleProps {
  role: "user" | "assistant"
  content: string
  timestamp?: Date
}

export function MessageBubble({ role, content, timestamp }: MessageBubbleProps) {
  return (
    <div className={cn("flex gap-3", role === "user" ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          role === "assistant"
            ? "bg-gradient-to-br from-primary-500 to-blue-400 text-white shadow-glow"
            : "bg-navy-100 text-navy-600",
        )}
      >
        {role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>
      <div className={cn("flex flex-col max-w-[75%]", role === "user" && "items-end")}>
        <div
          className={cn(
            "p-3.5 text-sm leading-relaxed whitespace-pre-wrap",
            role === "assistant"
              ? "bg-white text-navy-800 rounded-2xl rounded-tl-md shadow-card border border-navy-100"
              : "bg-primary-500 text-white rounded-2xl rounded-tr-md",
          )}
        >
          {content}
        </div>
        {timestamp && (
          <span className="text-[10px] text-navy-400 mt-1 px-1">
            {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(timestamp)}
          </span>
        )}
      </div>
    </div>
  )
}
