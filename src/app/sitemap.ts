import type { MetadataRoute } from "next"
import { getEnv } from "@/lib/env"

const APP_URL = getEnv("NEXT_PUBLIC_APP_URL", "https://clinot.ai")

const routes = [
  { path: "", priority: 1.0, changeFrequency: "monthly" as const },
  { path: "/product", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/features", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/features/ai-receptionist", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/features/appointments", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/features/patient-communication", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/features/whatsapp", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/features/dashboard", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/security", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/login", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/chat", priority: 0.5, changeFrequency: "weekly" as const },
  { path: "/dashboard", priority: 0.1, changeFrequency: "daily" as const },
]

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${APP_URL}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
