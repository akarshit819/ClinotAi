import { Star, Quote } from "lucide-react"

const testimonials = [
  {
    quote: "Clinot handles about 40% of our incoming patient questions automatically. My front desk staff can finally focus on patients in the chair instead of answering the same hours and insurance questions all day.",
    name: "Dr. Sarah Chen",
    role: "Owner, Chen Family Dentistry",
    rating: 5,
  },
  {
    quote: "We were losing after-hours inquiries to voicemail. Since installing Clinot, we have captured 23 new patient appointments from people who visited our site after hours. That is $12,000 in new revenue in the first month.",
    name: "Dr. Michael Torres",
    role: "Owner, Torres Dental Group",
    rating: 5,
  },
  {
    quote: "The setup took less than an hour. We told Clinot about our practice and it just worked. Our patients love that they can get answers at 10 PM without waiting until morning.",
    name: "Dr. Emily Park",
    role: "Owner, Park Pediatric Dentistry",
    rating: 5,
  },
]

export function Testimonials() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-25 to-white pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="section-title mb-4">Trusted by Clinics Like Yours</h2>
          <p className="section-subtitle">
            See how other healthcare practices are using Clinot to capture more patients and reduce staff interruptions.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="relative p-6 rounded-2xl border border-navy-100 bg-white shadow-card hover:shadow-card-hover transition-all duration-200"
            >
              <Quote className="h-6 w-6 text-primary-200 mb-3" />
              <p className="text-sm text-navy-600 leading-relaxed mb-4">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <div className="border-t border-navy-100 pt-3">
                <p className="text-xs font-semibold text-navy-900">{t.name}</p>
                <p className="text-2xs text-navy-400">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
