import crypto from "crypto"
import fs from "fs"
import path from "path"
import { prisma } from "./lib/db"
import { registerClinic } from "./lib/auth"
import { ALL_PERMISSIONS } from "./lib/permissions"

/**
 * Development/test user seed.
 *
 * Creates a single, clearly-marked development/test account using the SAME
 * signup logic as the production register endpoint (`registerClinic`), so the
 * user/clinic/roles/session records are created exactly like a real signup.
 *
 * Safety:
 * - Refuses to run when NODE_ENV=production unless CLINOT_DEV_SEED="true".
 * - Never overwrites or modifies existing users: if the email already exists
 *   the script exits without touching anything.
 * - The account is explicitly named "Dev Test" and the phone/country reflect
 *   the requested test profile (India, +918700879401).
 */

const TEST_EMAIL = "dev-user-india@clinot.ai"
const TEST_CLINIC_NAME = "Clinot Dev Test (India)"
const TEST_PHONE = "+918700879401"
const TEST_COUNTRY = "IN"
const TEST_TIMEZONE = "Asia/Kolkata"

function loadDotEnv(): void {
  try {
    const envPath = path.resolve(process.cwd(), ".env")
    if (!fs.existsSync(envPath)) return
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // Ignore load errors; rely on the environment.
  }
}

function generateStrongPassword(): string {
  const random = crypto.randomBytes(16).toString("base64url")
  // Suffix guarantees upper/lower/digit/special characters so the password
  // satisfies the same strength rules as the normal signup form.
  return `${random.slice(0, 16)}A9!x`
}

async function ensurePermissions(): Promise<void> {
  for (const perm of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description, module: perm.module },
      create: { code: perm.code, name: perm.name, description: perm.description, module: perm.module },
    })
  }
}

async function main(): Promise<void> {
  loadDotEnv()

  const inProduction = process.env.NODE_ENV === "production"
  const explicitlyAllowed = process.env.CLINOT_DEV_SEED === "true"
  if (inProduction && !explicitlyAllowed) {
    console.error(
      "[dev-user] Refusing to create a development/test user in production. " +
      "Set NODE_ENV to development (or test) OR set CLINOT_DEV_SEED=true to create it explicitly.",
    )
    process.exit(1)
  }

  console.log("[dev-user] Creating Clinot development/test account (India)…")

  // Keep the new clinic's default roles functional even on a partially seeded DB.
  await ensurePermissions()

  // Never overwrite an existing account.
  const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } })
  if (existing) {
    console.log(`[dev-user] ${TEST_EMAIL} already exists. Skipping creation — no existing data was modified.`)
    return
  }

  const password = generateStrongPassword()

  // Use the real signup path (same function the /api/auth/register route calls).
  const result = await registerClinic({
    name: "Clinot Dev Test",
    email: TEST_EMAIL,
    password,
    clinicName: TEST_CLINIC_NAME,
    ip: "127.0.0.1",
    userAgent: "dev-seed-script",
  })

  if ("error" in result) {
    if (result.status === 409) {
      console.log("[dev-user] Account already exists. Skipping creation — no existing data was modified.")
      return
    }
    console.error("[dev-user] Failed to create account:", result.error)
    process.exit(1)
  }

  // Apply the requested test profile to the newly-created clinic only.
  await prisma.clinic.update({
    where: { id: result.user.clinicId },
    data: {
      name: TEST_CLINIC_NAME,
      country: TEST_COUNTRY,
      phone: TEST_PHONE,
      timezone: TEST_TIMEZONE,
      language: "en",
      isOnboarded: true,
      onboardingStep: 5,
    },
  })

  console.log("")
  console.log("============================================================")
  console.log("  CLINOT DEVELOPMENT/TEST ACCOUNT (INDIA)")
  console.log("============================================================")
  console.log("  This is a development/test account only. Do not use in production.")
  console.log("  Login email : " + TEST_EMAIL)
  console.log("  Password    : " + password)
  console.log("  Phone       : " + TEST_PHONE)
  console.log("  Country     : " + TEST_COUNTRY + " (India)")
  console.log("  Clinic      : " + TEST_CLINIC_NAME)
  console.log("============================================================")
}

main()
  .catch((e) => {
    console.error("[dev-user] Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
