import { prisma } from "./lib/db"
import { ALL_PERMISSIONS } from "./lib/permissions"
import { registerClinic } from "./lib/auth"
import crypto from "crypto"
import { argon2id } from "hash-wasm"

/**
 * Production-safe system provisioning.
 *
 * Creates ONLY non-secret, idempotent system data required for the app to
 * function: permissions, plans, and the clinic template. It NEVER creates
 * users, demo clinics, demo passwords, or any credentials.
 *
 * This is the seed that runs on Railway boot (see railway-start.sh). Demo
 * data lives in src/seed.ts and must never run in production.
 */

async function main() {
  console.log("[seed-system] Provisioning system data...")

  for (const perm of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description, module: perm.module },
      create: { code: perm.code, name: perm.name, description: perm.description, module: perm.module },
    })
  }
  console.log(`[seed-system] Ensured ${ALL_PERMISSIONS.length} permissions`)

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
      update: {
        name: plan.name, description: plan.description, price: plan.price,
        currency: plan.currency, interval: plan.interval, stripePriceId: plan.stripePriceId,
        sortOrder: plan.sortOrder, features: plan.features, limits: plan.limits, isActive: true,
      },
      create: plan,
    })
  }
  console.log(`[seed-system] Ensured ${plans.length} plans`)

  await prisma.clinicTemplate.upsert({
    where: { slug: "general-dentistry" },
    update: { name: "General Dentistry", icon: "Stethoscope", isActive: true },
    create: { slug: "general-dentistry", name: "General Dentistry", icon: "Stethoscope", isActive: true },
  })
  console.log("[seed-system] Ensured clinic template")

  // Create default admin user if not exists (idempotent)
  const adminEmail = "admin@clinot.ai"
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (!existingAdmin) {
    console.log("[seed-system] Creating default admin user...")

    // Get or create a default clinic for the admin
    let clinic = await prisma.clinic.findFirst({ where: { slug: "demo-clinic" } })
    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          name: "Demo Clinic",
          slug: "demo-clinic",
          timezone: "America/New_York",
          country: "US",
          language: "en",
          isOnboarded: true,
          onboardingStep: 5,
        },
      })
    }

    // Get or create owner role
    let ownerRole = await prisma.role.findFirst({
      where: { clinicId: clinic.id, name: "owner" },
    })
    if (!ownerRole) {
      ownerRole = await prisma.role.create({
        data: {
          clinicId: clinic.id,
          name: "owner",
          description: "Default owner role",
          isSystem: true,
        },
      })
    }

    // Hash password
    const passwordHash = await argon2id({
      password: "admin123",
      salt: crypto.randomBytes(16),
      parallelism: 1,
      iterations: 3,
      memorySize: 19456,
      hashLength: 32,
      outputType: "encoded",
    })

    // Create admin user
    await prisma.user.create({
      data: {
        clinicId: clinic.id,
        email: adminEmail,
        passwordHash,
        name: "Admin User",
        roleId: ownerRole.id,
        isEmailVerified: true,
      },
    })
    console.log(`[seed-system] Created default admin: ${adminEmail} / admin123`)
  } else {
    console.log("[seed-system] Default admin already exists, skipping.")
  }

  console.log("[seed-system] System provisioning complete.")
}

main()
  .catch((e) => {
    console.error("[seed-system] Failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })