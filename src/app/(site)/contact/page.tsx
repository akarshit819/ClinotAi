"use client"

import { useState, type FormEvent } from "react"
import { PageHero } from "@/components/site/PageHero"
import { SectionHeader } from "@/components/site/SectionHeader"
import { Reveal } from "@/components/site/Reveal"
import { Button } from "@/components/ui/Button"
import { Mail, MessageSquare, BookOpen, ArrowRight } from "lucide-react"

const topics = ["Sales & pricing", "Live demo", "Support", "Something else"]

function ContactForm() {
  const [name, setName] = useState("")
  const [clinic, setClinic] = useState("")
  const [email, setEmail] = useState("")
  const [topic, setTopic] = useState(topics[0])
  const [message, setMessage] = useState("")

  const openEmail = (e: FormEvent) => {
    e.preventDefault()
    const subject = encodeURIComponent(`[Clinot ${topic}] ${clinic || name || "New inquiry"}`)
    const body = encodeURIComponent(
      `Name: ${name}\nClinic: ${clinic}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`,
    )
    window.location.href = `mailto:sales@clinot.ai?subject=${subject}&body=${body}`
  }

  const inputClass =
    "w-full rounded-xl border border-navy-150 bg-white px-4 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-300 transition"

  return (
    <form onSubmit={openEmail} className="rounded-2xl border border-navy-100 bg-white shadow-card p-6 md:p-8">
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <label className="block">
          <span className="block text-xs font-semibold text-navy-700 mb-1.5">Your name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Smith" className={inputClass} autoComplete="name" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-navy-700 mb-1.5">Clinic name</span>
          <input value={clinic} onChange={(e) => setClinic(e.target.value)} placeholder="Smith Family Dentistry" className={inputClass} autoComplete="organization" />
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <label className="block">
          <span className="block text-xs font-semibold text-navy-700 mb-1.5">Email</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clinic.com" className={inputClass} autoComplete="email" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-navy-700 mb-1.5">Topic</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass}>
            {topics.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block mb-5">
        <span className="block text-xs font-semibold text-navy-700 mb-1.5">Message</span>
        <textarea required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your practice and what you need…" rows={5} className={inputClass} />
      </label>
      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Open email app to send
        <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="text-xs text-navy-400 mt-3 leading-relaxed">
        This opens your own email app addressed to our team — nothing is sent automatically, and no account is needed.
      </p>
    </form>
  )
}

export default function ContactPage() {
  return (
    <>
      <PageHero
        badge="Contact"
        title="Talk to a human about Clinot"
        subtitle="Sales, demos, or support — send us a note and we'll get back to you."
        primaryCta={{ label: "Get Started", href: "/signup" }}
        secondaryCta={{ label: "See It Live", href: "/demo" }}
      />

      <section aria-label="Contact options" className="relative pb-20 md:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            badge="Reach us"
            title="Two ways to start the conversation"
          />
          <div className="grid lg:grid-cols-5 gap-6 max-w-5xl mx-auto items-start">
            <Reveal className="lg:col-span-3">
              <ContactForm />
            </Reveal>
            <div className="lg:col-span-2 space-y-4">
              <Reveal delay={80} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 mb-4">
                  <Mail className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-navy-900 mb-1.5">Email us directly</h3>
                <p className="text-xs text-navy-400 leading-relaxed mb-3">
                  Prefer your own inbox? Write to us anytime.
                </p>
                <a href="mailto:sales@clinot.ai" className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                  sales@clinot.ai
                </a>
              </Reveal>
              <Reveal delay={140} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 mb-4">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-navy-900 mb-1.5">See it before you ask</h3>
                <p className="text-xs text-navy-400 leading-relaxed mb-3">
                  Most questions answer themselves in the live demo clinic.
                </p>
                <a href="/demo" className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                  Try the live demo
                </a>
              </Reveal>
              <Reveal delay={200} className="p-6 rounded-2xl border border-navy-100 bg-white shadow-card">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50 mb-4">
                  <BookOpen className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-navy-900 mb-1.5">Common questions</h3>
                <p className="text-xs text-navy-400 leading-relaxed mb-3">
                  Setup, control, pricing, and emergencies — answered.
                </p>
                <a href="/faq" className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                  Browse the FAQ
                </a>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
