import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clinot - 24/7 AI Receptionist for Healthcare",
    short_name: "Clinot",
    description: "AI receptionist that answers patient questions, books appointments, and supports clinics 24/7.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F9FC",
    theme_color: "#2463EB",
    orientation: "any",
    categories: ["medical", "healthcare", "productivity"],
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }
}
