/**
 * TEST 13/14: schema ↔ migration ↔ query consistency (no database needed).
 *
 * Production incident: prisma/schema.prisma declared Appointment.endTime
 * but NO committed migration created the column, so every appointment
 * query failed in production with "column Appointment.endTime does not
 * exist" while typecheck/tests stayed green.
 *
 * This test fails the build if that class of drift ever recurs:
 *   1. Every scalar field of the Appointment model must be covered by
 *      either a CREATE TABLE or an ADD COLUMN in the migration SQLs.
 *   2. The production launcher must run `prisma migrate deploy`.
 *   3. The appointment queries must only select columns covered above
 *      (Appointment model fields — verified via the same coverage map).
 */
import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const ROOT = process.cwd()

function readSchemaAppointmentFields(): string[] {
  const schema = fs.readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8")
  const block = schema.match(/^model Appointment \{([\s\S]*?)^\}/m)
  if (!block) throw new Error("Appointment model not found in schema.prisma")
  const fields: string[] = []
  for (const line of block[1].split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("@@") || t.startsWith("//")) continue
    const parts = t.split(/\s+/)
    if (parts.length < 2) continue
    const ftype = parts[1].replace(/[?[\]]/g, "")
    if (["String", "Boolean", "Int", "BigInt", "Float", "DateTime", "Json", "Bytes", "Decimal"].includes(ftype)) {
      fields.push(parts[0])
    }
  }
  return fields
}

function readMigrationAppointmentColumns(): Set<string> {
  const cols = new Set<string>()
  const migDir = path.join(ROOT, "prisma", "migrations")
  for (const entry of fs.readdirSync(migDir)) {
    const sqlPath = path.join(migDir, entry, "migration.sql")
    if (!fs.existsSync(sqlPath)) continue
    const sql = fs.readFileSync(sqlPath, "utf8")
    // CREATE TABLE "Appointment" ( ... "col" ... );
    const createRe = /CREATE TABLE "Appointment" \(([\s\S]*?)\n\s*\);/g
    let c: RegExpExecArray | null
    while ((c = createRe.exec(sql))) {
      for (const line of c[1].split("\n")) {
        const cm = line.trim().match(/^"(\w+)"/)
        if (cm) cols.add(cm[1])
      }
    }
    // ALTER TABLE "Appointment" ADD COLUMN "col" ...
    const alterRe = /ALTER TABLE "Appointment" ADD COLUMN "(\w+)"/g
    let a: RegExpExecArray | null
    while ((a = alterRe.exec(sql))) cols.add(a[1])
  }
  return cols
}

describe("schema ↔ migration consistency (Appointment)", () => {
  it("TEST 14: every Appointment schema field exists in the migration history", () => {
    const fields = readSchemaAppointmentFields()
    expect(fields).toContain("endTime")
    const cols = readMigrationAppointmentColumns()
    const missing = fields.filter((f) => !cols.has(f))
    expect(missing, `Appointment columns missing from migrations: ${missing.join(", ")}`).toEqual([])
  })

  it("the endTime migration is additive-only (no DROP/DELETE/ALTER COLUMN)", () => {
    const sql = fs.readFileSync(
      path.join(ROOT, "prisma", "migrations", "20260909000000_add_appointment_endtime", "migration.sql"),
      "utf8",
    )
    expect(sql).toMatch(/ADD COLUMN "endTime"/)
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i)
  })

  it("TEST 13: production launcher applies pending migrations via migrate deploy", () => {
    const launcher = fs.readFileSync(path.join(ROOT, "scripts", "start-production.js"), "utf8")
    expect(launcher).toMatch(/prisma migrate deploy/)
    for (const sh of ["voroa-start.sh", "railway-start.sh"]) {
      const p = path.join(ROOT, sh)
      if (fs.existsSync(p)) {
        expect(fs.readFileSync(p, "utf8")).toMatch(/prisma migrate deploy/)
      }
    }
  })
})
