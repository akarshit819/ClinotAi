import fs from "fs"
import path from "path"
import { PrismaClient as SqlitePrismaClient } from "../.sqlite-client"
import { PrismaClient as PgPrismaClient } from "@prisma/client"

/**
 * One-time, idempotent data import: SQLite (old dev/prod DB) -> PostgreSQL.
 *
 * Preserves every primary key (cuid), timestamp, and relation by inserting
 * rows in FK-dependency order and skipping rows whose id already exists.
 *
 * Usage:
 *   SQLITE_DATABASE_URL="file:./prisma/dev.db" DATABASE_URL="postgres://..." \
 *     npm run db:import:sqlite
 *
 * Safety:
 * - Never deletes or overwrites existing rows in the target (skipDuplicates).
 * - Safe to re-run; already-imported rows are skipped.
 */

// Models ordered so that parents are imported before children (FK-safe).
const MODEL_ORDER = [
  "clinicTemplate",
  "permission",
  "plan",
  "clinic",
  "role",
  "rolePermission",
  "user",
  "session",
  "refreshToken",
  "emailVerificationToken",
  "passwordResetToken",
  "patient",
  "patientPlatformProfile",
  "integration",
  "whatsAppBusinessAccount",
  "whatsAppPhoneNumber",
  "whatsAppWebhookEvent",
  "service",
  "fAQ",
  "knowledgeBase",
  "apiConfig",
  "conversation",
  "conversationMessage",
  "appointment",
  "lead",
  "aiUsage",
  "auditLog",
  "subscription",
  "invoice",
  "billingHistory",
  "paymentAttempt",
  "stripeEvent",
] as const

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

async function main() {
  loadDotEnv()

  const sqliteUrl = process.env.SQLITE_DATABASE_URL
  const pgUrl = process.env.DATABASE_URL
  if (!sqliteUrl) {
    console.error("[import] SQLITE_DATABASE_URL is required (e.g. file:./prisma/dev.db)")
    process.exit(1)
  }
  if (!pgUrl || !pgUrl.startsWith("postgres")) {
    console.error("[import] DATABASE_URL must point to a PostgreSQL database")
    process.exit(1)
  }

  console.log(`[import] Reading from SQLite: ${sqliteUrl}`)
  console.log(`[import] Writing to PostgreSQL: ${pgUrl.replace(/\/\/[^@]+@/, "//***@")}`)

  const sqlite = new SqlitePrismaClient({
    datasources: { db: { url: sqliteUrl } },
  })
  const pg = new PgPrismaClient()

  const totals: Record<string, number> = {}
  let imported = 0
  let skipped = 0

  for (const model of MODEL_ORDER) {
    const rows = await (sqlite as any)[model].findMany()
    if (rows.length === 0) {
      totals[model] = 0
      continue
    }

    const result = await (pg as any)[model].createMany({
      data: rows,
      skipDuplicates: true,
    })

    totals[model] = result.count
    imported += result.count
    skipped += rows.length - result.count
    console.log(`[import] ${model}: ${result.count} imported, ${rows.length - result.count} skipped (already present)`)
  }

  await sqlite.$disconnect()
  await pg.$disconnect()

  console.log("")
  console.log(`[import] Done. ${imported} rows imported, ${skipped} rows skipped.`)
  for (const [model, count] of Object.entries(totals)) {
    console.log(`  ${model}: ${count}`)
  }
}

main().catch((e) => {
  console.error("[import] Failed:", e)
  process.exit(1)
})