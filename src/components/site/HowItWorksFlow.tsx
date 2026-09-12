import { User, MessageCircle, Bot, BookOpen, CalendarCheck, LayoutDashboard } from "lucide-react"
import { Reveal } from "./Reveal"

const nodes = [
  {
    icon: User,
    title: "Patient messages",
    desc: "A patient sends a WhatsApp message to your clinic — a question, a symptom, or an appointment request.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp receives it",
    desc: "Clinot's WhatsApp integration picks the message up instantly and queues it for processing.",
  },
  {
    icon: Bot,
    title: "Clinot AI understands",
    desc: "The AI receptionist classifies the intent, checks guardrails, and stays strictly on clinic topics.",
  },
  {
    icon: BookOpen,
    title: "Clinic knowledge applies",
    desc: "Answers come from your approved services, hours, pricing, and policies — never invented.",
  },
  {
    icon: CalendarCheck,
    title: "Appointment or response",
    desc: "Routine questions are answered on the spot. Appointment requests are collected for your team's confirmation.",
  },
  {
    icon: LayoutDashboard,
    title: "Your dashboard updates",
    desc: "Every inquiry, request, and conversation lands in your clinic dashboard for review and follow-up.",
  },
]

/**
 * Animated progression of the real Clinot pipeline:
 * patient → WhatsApp → AI receptionist → clinic knowledge →
 * appointment/response → dashboard. CSS-only motion.
 */
export function HowItWorksFlow() {
  return (
    <ol className="relative max-w-2xl mx-auto">
      <span
        aria-hidden="true"
        className="absolute left-[1.4rem] md:left-[1.6rem] top-4 bottom-4 w-px bg-gradient-to-b from-primary-200 via-primary-100 to-transparent"
      />
      {nodes.map((node, i) => {
        const Icon = node.icon
        return (
          <Reveal as="li" key={node.title} delay={Math.min(i * 60, 300)} className="relative flex gap-4 md:gap-5 pb-8 last:pb-0">
            <span className="relative z-10 flex h-11 w-11 md:h-[3.25rem] md:w-[3.25rem] shrink-0 items-center justify-center rounded-2xl bg-white border border-navy-100 shadow-card text-primary-600">
              <Icon className="h-5 w-5" />
              <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
                {i + 1}
              </span>
            </span>
            <span className="pt-1">
              <span className="block text-base font-semibold text-navy-900 mb-1">{node.title}</span>
              <span className="block text-sm text-navy-400 leading-relaxed">{node.desc}</span>
            </span>
          </Reveal>
        )
      })}
    </ol>
  )
}
