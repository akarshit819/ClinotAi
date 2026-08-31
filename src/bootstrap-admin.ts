import { prisma } from "./lib/db"
import { registerClinic, checkPasswordStrength } from "./lib/auth"
import { ALL_PERMISSIONS } from "./lib/permissions"
import fs from "fs"
import path from "path"

/**
 * Production Admin Bootstrap
 *
 * Creates the initial owner/admin account for a new production or staging deployment.
 * This script MUST be explicitly invoked or opted into via CLINOT_BOOTSTRAP_ADMIN=true.
 *
 * Requirements:
 * - CLINOT_BOOTSTRAP_ADMIN=true (explicit opt-in)
 * - BOOTSTRAP_ADMIN_EMAIL: email for the initial admin
 * - BOOTSTRAP_ADMIN_PASSWORD: strong password (validated via checkPasswordStrength)
 *
 * Optional (with sensible defaults):
 * - BOOTSTRAP_ADMIN_NAME: name for the admin user (default: "Admin")
 * - BOOTSTRAP_CLINIC_NAME: name for the clinic (default: "Clinot Dental Clinic")
 * - BOOTSTRAP_CLINIC_COUNTRY: country code (default: "US")
 * - BOOTSTRAP_CLINIC_TIMEZONE: timezone (default: "America/New_York")
 *
 * Safety:
 * - Refuses to run unless CLINOT_BOOTSTRAP_ADMIN=true
 * - Refuses if an admin/owner user with this email or clinic already exists
 * - Validates password strength using standard rules
 * - Automatically ensures permissions exist before role assignment
 * - Never logs the password
 * - Exits cleanly without changes if admin already exists
 */

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
    // Ignore load errors; rely on process environment.
  }
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

  const explicitlyAllowed = process.env.CLINOT_BOOTSTRAP_ADMIN === "true"

  if (!explicitlyAllowed) {
    console.error(
      "[bootstrap-admin] This script requires CLINOT_BOOTSTRAP_ADMIN=true. " +
        "Set CLINOT_BOOTSTRAP_ADMIN=true in your environment to execute."
    )
    process.exit(1)
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Admin"
  const clinicName = process.env.BOOTSTRAP_CLINIC_NAME?.trim() || "Clinot Dental Clinic"
  const clinicCountry = process.env.BOOTSTRAP_CLINIC_COUNTRY?.trim() || "US"
  const clinicTimezone = process.env.BOOTSTRAP_CLINIC_TIMEZONE?.trim() || "America/New_York"

  if (!email || !password) {
    console.error(
      "[bootstrap-admin] Missing required environment variables. " +
        "Required: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD"
    )
    process.exit(1)
  }

  const strength = checkPasswordStrength(password)
  if (!strength.valid) {
    console.error(`[bootstrap-admin] Password is too weak: ${strength.message}`)
    process.exit(1)
  }

  console.log("[bootstrap-admin] Ensuring system permissions exist...")
  await ensurePermissions()

  console.log("[bootstrap-admin] Checking for existing admin users...")

  // Check if user with this email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true, clinic: true },
  })

  if (existingUser) {
    console.log(
      `[bootstrap-admin] Admin user with email ${existingUser.email} already exists (Clinic: ${existingUser.clinic.name}). No action taken.`
    )
    return
  }

  // Check if any owner-role user already exists
  const existingOwner = await prisma.user.findFirst({
    where: { role: { name: "owner" } },
    include: { role: true, clinic: true },
  })

  if (existingOwner) {
    console.log(
      `[bootstrap-admin] Owner account already exists (${existingOwner.email} in clinic ${existingOwner.clinic.name}). No action taken.`
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

  // Apply the requested clinic profile to the newly-created clinic
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
  console.log("[bootstrap-admin] Bootstrap complete. You can now log in.")
}

main()
  .catch((e) => {
    console.error("[bootstrap-admin] Failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })