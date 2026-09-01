import { prisma } from "./lib/db"
import { ALL_PERMISSIONS } from "./lib/permissions"

/**
 * Production-safe system provisioning.
 *
 * Creates ONLY non-secret, idempotent system data required for the app to
 * function: permissions, plans, and the clinic template. It NEVER creates
 * users, demo clinics, demo passwords, or any credentials.
 *
 * Safety properties:
 * - Plain sequential idempotent upserts: every statement is atomic, every
 *   row is keyed by a unique column, and every boot iterates in the same
 *   order — so concurrent Web/Worker boots converge without interactive
 *   transactions or advisory locks (both of which are fragile behind
 *   connection poolers such as Render's PgBouncer).
 * - Hard watchdog: if any operation stalls (network partition, held lock),
 *   the script logs and exits non-zero well before a platform-level
 *   deployment timeout can silently kill it.
 * - Every phase logs, and failures print the exact Prisma error code and
 *   message (never a connection string or secret), so a failed deployment
 *   shows the precise failing operation.
 */

const WATCHDOG_MS = 90_000

async function seedPermissions(): Promise<void> {
  for (const perm of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description, module: perm.module },
      create: { code: perm.code, name: perm.name, description: perm.description, module: perm.module },
    })
  }
  console.log(`[seed-system] Ensured ${ALL_PERMISSIONS.length} permissions`)
}

async function seedPlans(): Promise<void> {
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
}

async function seedClinicTemplate(): Promise<void> {
  await prisma.clinicTemplate.upsert({
    where: { slug: "general-dentistry" },
    update: { name: "General Dentistry", icon: "Stethoscope", isActive: true },
    create: { slug: "general-dentistry", name: "General Dentistry", icon: "Stethoscope", isActive: true },
  })
  console.log("[seed-system] Ensured clinic template")
}

async function main() {
  console.log("[seed-system] Provisioning system data...")

  // Hard watchdog: a deployment must never hang indefinitely inside a seed.
  const watchdog = setTimeout(() => {
    console.error(
      `[seed-system] FATAL: seed did not complete within ${WATCHDOG_MS / 1000}s ` +
        `(stalled on a database operation — check DB connectivity/locks). Exiting to fail the deployment visibly.`
    )
    process.exit(1)
  }, WATCHDOG_MS)
  watchdog.unref()

  try {
    await seedPermissions()
    await seedPlans()
    await seedClinicTemplate()
    console.log("[seed-system] System provisioning complete.")
  } catch (e: any) {
    console.error("[seed-system] FAILED during provisioning.")
    console.error(`[seed-system] Prisma error code: ${e?.code ?? "n/a"}`)
    console.error(`[seed-system] Error message: ${e?.message ?? String(e)}`)
    await prisma.$disconnect().catch(() => undefined)
    process.exit(1)
  }

  await prisma.$disconnect().catch(() => undefined)
}

main()
