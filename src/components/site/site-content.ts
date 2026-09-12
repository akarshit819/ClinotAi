import {
  Bot,
  CalendarCheck,
  MessageSquare,
  MessageCircle,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react"

export interface FeatureMeta {
  slug: string
  href: string
  title: string
  short: string
  icon: LucideIcon
}

export const FEATURES: FeatureMeta[] = [
  {
    slug: "ai-receptionist",
    href: "/features/ai-receptionist",
    title: "AI Receptionist",
    short: "Answers routine patient questions instantly from your approved clinic knowledge — 24/7.",
    icon: Bot,
  },
  {
    slug: "appointments",
    href: "/features/appointments",
    title: "Appointment Management",
    short: "Collects requests, confirms details with patients, and keeps your team in control.",
    icon: CalendarCheck,
  },
  {
    slug: "patient-communication",
    href: "/features/patient-communication",
    title: "Patient Communication",
    short: "Every inquiry captured in one inbox — nothing lost to voicemail or missed calls.",
    icon: MessageSquare,
  },
  {
    slug: "whatsapp",
    href: "/features/whatsapp",
    title: "WhatsApp Integration",
    short: "Meet patients where they already message, with reliable delivery and retries.",
    icon: MessageCircle,
  },
  {
    slug: "dashboard",
    href: "/features/dashboard",
    title: "Clinic Dashboard",
    short: "Appointments, patients, conversations, and insights in one clean view.",
    icon: LayoutDashboard,
  },
]

export function relatedFeatures(slug: string): FeatureMeta[] {
  return FEATURES.filter((f) => f.slug !== slug).slice(0, 4)
}
