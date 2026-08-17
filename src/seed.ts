import crypto from "crypto"
import { argon2id } from "hash-wasm"
import { prisma } from "./lib/db"
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "./lib/permissions"

async function main() {
  const isProduction = process.env.NODE_ENV === "production"
  const explicitlyAllowed = process.env.CLINOT_SEED_DEMO === "true"
  if (isProduction && !explicitlyAllowed) {
    console.error(
      "[seed] Refusing to create demo data (including the admin@clinot.ai demo account) in production. " +
      "This seed is for local development only. If you are absolutely certain, set CLINOT_SEED_DEMO=true.",
    )
    process.exit(1)
  }

  console.log("Seeding database...")

  // Create system permissions
  for (const perm of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description, module: perm.module },
      create: { code: perm.code, name: perm.name, description: perm.description, module: perm.module },
    })
  }
  console.log(`Created ${ALL_PERMISSIONS.length} permissions`)

  // Create plans
  const plans = [
    {
      name: "Starter",
      slug: "starter",
      description: "Essential AI receptionist for small practices",
      price: 4900,
      currency: "usd",
      interval: "month",
      stripePriceId: process.env.STRIPE_STARTER_PRICE_ID || "",
      sortOrder: 1,
      features: JSON.stringify({
        ai: true, messaging: true, whatsapp: false, integrations: false,
        customBranding: false, multiLanguage: false, analytics: "basic",
        support: "email", sla: false,
      }),
      limits: JSON.stringify({
        conversations: 500, aiRequests: 500, tokens: 500000,
        channels: 1, teamMembers: 2, storage: 0, attachments: 0,
      }),
    },
    {
      name: "Professional",
      slug: "professional",
      description: "Advanced AI receptionist for growing clinics",
      price: 19900,
      currency: "usd",
      interval: "month",
      stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || "",
      sortOrder: 2,
      features: JSON.stringify({
        ai: true, messaging: true, whatsapp: true, integrations: true,
        customBranding: true, multiLanguage: true, analytics: "advanced",
        support: "priority", sla: false,
      }),
      limits: JSON.stringify({
        conversations: 2000, aiRequests: 2000, tokens: 2000000,
        channels: 3, teamMembers: 10, storage: 1000, attachments: 100,
      }),
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      description: "Complete AI solution for multi-location clinics",
      price: 0,
      currency: "usd",
      interval: "month",
      stripePriceId: "",
      sortOrder: 3,
      features: JSON.stringify({
        ai: true, messaging: true, whatsapp: true, integrations: true,
        customBranding: true, multiLanguage: true, analytics: "enterprise",
        support: "dedicated", sla: true,
      }),
      limits: JSON.stringify({
        conversations: -1, aiRequests: -1, tokens: -1,
        channels: -1, teamMembers: -1, storage: -1, attachments: -1,
      }),
    },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: { name: plan.name, description: plan.description, price: plan.price, currency: plan.currency, interval: plan.interval, stripePriceId: plan.stripePriceId, sortOrder: plan.sortOrder, features: plan.features, limits: plan.limits, isActive: true },
      create: plan,
    })
  }
  console.log(`Created ${plans.length} plans`)

  // Create clinic templates
  await prisma.clinicTemplate.upsert({
    where: { slug: "general-dentistry" },
    update: { name: "General Dentistry", icon: "Stethoscope", isActive: true },
    create: { slug: "general-dentistry", name: "General Dentistry", icon: "Stethoscope", isActive: true },
  })

  // Create demo clinic
  const clinic = await prisma.clinic.upsert({
    where: { slug: "demo-clinic" },
    update: { name: "Demo Dental Clinic" },
    create: {
      name: "Demo Dental Clinic",
      slug: "demo-clinic",
      timezone: "America/New_York",
      country: "US",
      language: "en",
      isOnboarded: true,
      onboardingStep: 5,
      openingHours: JSON.stringify({
        monday: { open: "09:00", close: "17:00" },
        tuesday: { open: "09:00", close: "17:00" },
        wednesday: { open: "09:00", close: "17:00" },
        thursday: { open: "09:00", close: "17:00" },
        friday: { open: "09:00", close: "16:00" },
      }),
    },
  })
  console.log(`Created clinic: ${clinic.name}`)

  // Create roles for demo clinic
  const roleNames = ["owner", "admin", "staff"]
  const createdRoles: Record<string, string> = {}

  for (const roleName of roleNames) {
    const role = await prisma.role.upsert({
      where: { clinicId_name: { clinicId: clinic.id, name: roleName } },
      update: { isSystem: true },
      create: {
        clinicId: clinic.id,
        name: roleName,
        description: `Default ${roleName} role`,
        isSystem: true,
      },
    })
    createdRoles[roleName] = role.id

    // Assign permissions
    const permCodes = DEFAULT_ROLE_PERMISSIONS[roleName] || []
    const permissions = await prisma.permission.findMany({
      where: { code: { in: permCodes } },
    })
    for (const perm of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      })
    }
    console.log(`Created role: ${roleName} with ${permissions.length} permissions`)
  }

  // Create demo admin user
  const passwordHash = await argon2id({
    password: "admin123",
    salt: crypto.randomBytes(16),
    parallelism: 1,
    iterations: 3,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  })

  const user = await prisma.user.upsert({
    where: { email: "admin@clinot.ai" },
    update: {
      name: "Admin User",
      passwordHash,
      roleId: createdRoles.owner,
      isEmailVerified: true,
    },
    create: {
      clinicId: clinic.id,
      email: "admin@clinot.ai",
      passwordHash,
      name: "Admin User",
      roleId: createdRoles.owner,
      isEmailVerified: true,
    },
  })
  console.log(`Created user: ${user.email} / admin123`)

  // Create FAQs
  const faqs = [
    { question: "What are your office hours?", answer: "We're open Monday to Friday, 9 AM to 5 PM.", category: "general" },
    { question: "Do you accept insurance?", answer: "We accept most major dental insurance plans.", category: "billing" },
    { question: "How do I schedule an appointment?", answer: "You can schedule by phone or through our website.", category: "appointments" },
    { question: "What should I bring to my first appointment?", answer: "Bring your ID, insurance card, and any dental records.", category: "appointments" },
    { question: "Do you offer emergency services?", answer: "Yes, we offer emergency dental services. Call our emergency line.", category: "emergency" },
    { question: "What payment methods do you accept?", answer: "We accept cash, credit cards, and most dental insurance.", category: "billing" },
    { question: "How often should I visit the dentist?", answer: "We recommend a checkup and cleaning every 6 months.", category: "general" },
    { question: "Do you offer teeth whitening?", answer: "Yes, we offer professional teeth whitening services.", category: "services" },
    { question: "What is your cancellation policy?", answer: "Please provide 24 hours notice for cancellations.", category: "appointments" },
    { question: "Do you treat children?", answer: "Yes, we welcome patients of all ages.", category: "general" },
    { question: "How long does a routine cleaning take?", answer: "A routine cleaning typically takes about 30-45 minutes.", category: "services" },
    { question: "Do you offer payment plans?", answer: "Yes, we offer flexible payment plans for major procedures.", category: "billing" },
  ]

  for (const faq of faqs) {
    await prisma.fAQ.upsert({
      where: { id: `${clinic.id}-${faq.question.slice(0, 20)}` },
      update: { answer: faq.answer, category: faq.category },
      create: {
        clinicId: clinic.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
      },
    }).catch(() => {
      // Ignore upsert conflicts - use create instead
    })
  }
  console.log(`Created ${faqs.length} FAQs`)

  // Create services
  const services = [
    { name: "Dental Checkup", price: "$89", duration: 30 },
    { name: "Professional Cleaning", price: "$129", duration: 45 },
    { name: "X-Rays", price: "$49", duration: 15 },
    { name: "Tooth Extraction", price: "$199", duration: 45 },
    { name: "Root Canal", price: "$899", duration: 90 },
    { name: "Teeth Whitening", price: "$499", duration: 60 },
    { name: "Dental Filling", price: "$199", duration: 30 },
  ]

  for (const service of services) {
    await prisma.service.create({
      data: {
        clinicId: clinic.id,
        name: service.name,
        price: service.price,
        duration: service.duration,
      },
    }).catch(() => {})
  }
  console.log(`Created ${services.length} services`)

  console.log("Seed complete!")
}

main()
  .catch((e) => {
    console.error("Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
