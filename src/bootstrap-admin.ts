import { prisma } from "./lib/db"
import { registerClinic } from "./lib/auth"
import { checkPasswordStrength } from "./lib/auth"

/**
 * Production Admin Bootstrap
 *
 * Creates the initial owner/admin account for a new production deployment.
 * This script MUST be explicitly invoked — it never runs automatically on boot.
 *
 * Requirements:
 * - NODE_ENV=production
 * - CLINOT_BOOTSTRAP_ADMIN=true (explicit opt-in)
 * - BOOTSTRAP_ADMIN_EMAIL: email for the initial admin
 * - BOOTSTRAP_ADMIN_PASSWORD: strong password (validated via checkPasswordStrength)
 * - BOOTSTRAP_ADMIN_NAME: name for the admin user
 * - BOOTSTRAP_CLINIC_NAME: name for the clinic
 * - BOOTSTRAP_CLINIC_COUNTRY: country code (e.g., "US")
 * - BOOTSTRAP_CLINIC_TIMEZONE: timezone (e.g., "America/New_York")
 *
 * Safety:
 * - Refuses to run unless NODE_ENV=production AND CLINOT_BOOTSTRAP_ADMIN=true
 * - Refuses if an admin user already exists in any clinic
 * - Validates password strength using the same rules as normal signup
 * - Uses the same registerClinic logic as the public signup endpoint
 * - Never logs the password
 * - Exits successfully without changes if admin already exists
 */

function loadDotEnv(): void {
  try {
    const fs = require("fs")
    const path = require("path")
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

async function main(): Promise<void> {
  loadDotEnv()

  const inProduction = process.env.NODE_ENV === "production"
  const explicitlyAllowed = process.env.CLINOT_BOOTSTRAP_ADMIN === "true"

  if (!inProduction || !explicitlyAllowed) {
    console.error(
      "[bootstrap-admin] This script only runs in production with CLINOT_BOOTSTRAP_ADMIN=true. " +
        "Set NODE_ENV=production and CLINOT_BOOTSTRAP_ADMIN=true to run."
    )
    process.exit(1)
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim()
  const clinicName = process.env.BOOTSTRAP_CLINIC_NAME?.trim()
  const clinicCountry = process.env.BOOTSTRAP_CLINIC_COUNTRY?.trim()
  const clinicTimezone = process.env.BOOTSTRAP_CLINIC_TIMEZONE?.trim()

  if (!email || !password || !name || !clinicName || !clinicCountry || !clinicTimezone) {
    console.error(
      "[bootstrap-admin] Missing required environment variables. " +
        "Required: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME, " +
        "BOOTSTRAP_CLINIC_NAME, BOOTSTRAP_CLINIC_COUNTRY, BOOTSTRAP_CLINIC_TIMEZONE"
    )
    process.exit(1)
  }

  const strength = checkPasswordStrength(password)
  if (!strength.valid) {
    console.error(`[bootstrap-admin] Password is too weak: ${strength.message}`)
    process.exit(1)
  }

  console.log("[bootstrap-admin] Checking for existing admin users...")

  // Check if any owner-role user already exists
  const existingOwner = await prisma.user.findFirst({
    where: { role: { name: "owner" } },
    include: { role: true, clinic: true },
  })

  if (existingOwner) {
    console.log(
      `[bootstrap-admin] Admin user already exists (${existingOwner.email} in clinic ${existingOwner.clinic.name}). ` +
        "No action taken."
    )
    return
  }

  console.log("[bootstrap-admin] Creating initial admin account...")

  const result = await registerClinic({
    name,
    email,
    password,
    clinicName,
    ip: "127.0.0.1",
    userAgent: "bootstrap-admin-script",
  })

  if ("error" in result) {
    if (result.status === 409) {
      console.log("[bootstrap-admin] Account already exists. No action taken.")
      return
    }
    console.error("[bootstrap-admin] Failed to create admin account:", result.error)
    process.exit(1)
  }

  // Apply the requested clinic profile to the newly-created clinic only.
  await prisma.clinic.update({
    where: { id: result.user.clinicId },
    data: {
      name: clinicName,
      country: clinicCountry,
      timezone: clinicTimezone,
      language: "en",
      isOnboarded: true,
      onboardingStep: 5,
    },
  })

  console.log("")
  console.log("============================================================")
  console.log("  CLINOT INITIAL ADMIN ACCOUNT CREATED")
  console.log("============================================================")
  console.log("  Login email : " + email)
  console.log("  Clinic      : " + clinicName)
  console.log("  Country     : " + clinicCountry)
  console.log("  Timezone    : " + clinicTimezone)
  console.log("============================================================")
  console.log("")
  console.log("[bootstrap-admin] Bootstrap complete. Remove CLINOT_BOOTSTRAP_ADMIN from environment.")
}

main()
  .catch((e) => {
    console.error("[bootstrap-admin] Failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })