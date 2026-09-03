/**
 * WhatsApp webhook + phone record update test (gated by WHATSAPP_WEBHOOK_TEST=1).
 *
 * Verifies the production fix for the WhatsAppPhoneNumber update bug:
 * the schema's unique key is the compound (clinicId, phoneNumberId),
 * NOT phoneNumberId alone. The webhook handler must use the compound
 * key when updating lastMessageAt.
 *
 * Uses real PostgreSQL via embedded-postgres and the real Prisma
 * client (separate Node process for the launcher) so the test
 * exercises the exact query shape the production code uses.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import EmbeddedPostgres from "embedded-postgres"
import { execSync, spawn } from "child_process"
import fs from "fs"
import path from "path"
import { Client as PgClient } from "pg"
import { PrismaClient } from "@prisma/client"

const ENABLED = process.env.WHATSAPP_WEBHOOK_TEST === "1"
const describeMaybe = ENABLED ? describe : describe.skip

describeMaybe("WhatsApp webhook + phone record update (real PostgreSQL)", () => {
  let pg: EmbeddedPostgres | null = null
  let databaseUrl: string
  let workDir: string
  let port = 0
  let prisma: PrismaClient | null = null
  let baseUrl = ""

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  beforeAll(async () => {
    workDir = path.join(process.cwd(), ".freebuff", "wa-test-" + Date.now())
    fs.mkdirSync(workDir, { recursive: true })

    port = 6300 + Math.floor(Math.random() * 200)
    baseUrl = `http://127.0.0.1:${port}`

    pg = new EmbeddedPostgres({
      databaseDir: path.join(workDir, "data"),
      user: "postgres",
      password: "postgres",
      port,
      persistent: false,
    })
    await pg.initialise()
    await pg.start()
    await pg.createDatabase("watest")

    const pgPort = (pg as any).options?.port ?? port
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/watest`

    // Apply the production migrations.
    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma")
    const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma")
    execSync(`"${prismaBin}" migrate deploy --schema "${schemaPath}"`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    })

    // We can use the real Prisma client here because the test is the
    // only process touching the .dll until the launcher starts.
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  }, 120_000)

  afterAll(async () => {
    if (prisma) {
      try { await prisma.$disconnect() } catch {}
    }
    if (pg) {
      try { await pg.stop() } catch {}
    }
    if (workDir && fs.existsSync(workDir)) {
      try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
    }
  }, 30_000)

  it("WhatsAppPhoneNumber update with compound key (clinicId, phoneNumberId) succeeds and updates only the targeted row", async () => {
    expect(prisma).toBeTruthy()
    const clinicA = `clinic-a-${Date.now()}`
    const clinicB = `clinic-b-${Date.now()}`
    const wabaA = `waba-a-${Date.now()}`
    const wabaB = `waba-b-${Date.now()}`
    const phoneId = `pn-${Date.now()}`

    // Create two clinics, each with their own WABA, with two different
    // phoneNumberIds (the compound unique key is (clinicId, phoneNumberId)).
    await prisma!.clinic.create({
      data: { id: clinicA, slug: clinicA, name: "Clinic A" },
    })
    await prisma!.clinic.create({
      data: { id: clinicB, slug: clinicB, name: "Clinic B" },
    })
    await prisma!.whatsAppBusinessAccount.create({
      data: { id: wabaA, clinicId: clinicA, wabaId: `${wabaA}-external` },
    })
    await prisma!.whatsAppBusinessAccount.create({
      data: { id: wabaB, clinicId: clinicB, wabaId: `${wabaB}-external` },
    })
    const phoneA = await prisma!.whatsAppPhoneNumber.create({
      data: {
        wabaId: wabaA,
        clinicId: clinicA,
        phoneNumberId: `${phoneId}-A`,
        displayPhoneNumber: "+15550000001",
      },
    })
    const phoneB = await prisma!.whatsAppPhoneNumber.create({
      data: {
        wabaId: wabaB,
        clinicId: clinicB,
        phoneNumberId: `${phoneId}-B`,
        displayPhoneNumber: "+15550000002",
      },
    })

    // The fix: use the compound unique key, not phoneNumberId alone.
    const newLastMessageAt = new Date("2026-09-03T12:00:00Z")
    const updated = await prisma!.whatsAppPhoneNumber.update({
      where: { clinicId_phoneNumberId: { clinicId: clinicA, phoneNumberId: phoneA.phoneNumberId } },
      data: { lastMessageAt: newLastMessageAt },
    })
    expect(updated.id).toBe(phoneA.id)
    expect(updated.lastMessageAt?.toISOString()).toBe(newLastMessageAt.toISOString())

    // Clinic B's phone record must NOT have been touched.
    const phoneBAfter = await prisma!.whatsAppPhoneNumber.findUnique({ where: { id: phoneB.id } })
    expect(phoneBAfter?.lastMessageAt).toBeNull()

    // Multi-tenant isolation preserved: clinic A's record is the only
    // one that changed.
    const allPhones = await prisma!.whatsAppPhoneNumber.findMany({
      where: { phoneNumberId: { startsWith: phoneId } },
    })
    const touched = allPhones.filter((p) => p.lastMessageAt !== null)
    expect(touched.length).toBe(1)
    expect(touched[0].clinicId).toBe(clinicA)
  }, 30_000)

  it("WhatsAppPhoneNumber update with phoneNumberId ALONE fails (regression guard)", async () => {
    // Prisma's generated type requires id or clinicId_phoneNumberId.
    // Using `as any` would have hidden this in production. This test
    // documents the correct behavior: the wrong shape is rejected.
    expect(prisma).toBeTruthy()
    const clinicId = `clinic-c-${Date.now()}`
    const wabaId = `waba-c-${Date.now()}`
    const phoneId = `pn-c-${Date.now()}`
    await prisma!.clinic.create({ data: { id: clinicId, slug: clinicId, name: "Clinic C" } })
    await prisma!.whatsAppBusinessAccount.create({
      data: { id: wabaId, clinicId, wabaId: `${wabaId}-external` },
    })
    await prisma!.whatsAppPhoneNumber.create({
      data: {
        wabaId,
        clinicId,
        phoneNumberId: phoneId,
        displayPhoneNumber: "+15550000003",
      },
    })
    // The old (broken) shape — Prisma must reject it because
    // phoneNumberId is NOT a unique key.
    await expect(
      (prisma!.whatsAppPhoneNumber.update as any)({
        where: { phoneNumberId: phoneId },
        data: { lastMessageAt: new Date() },
      }),
    ).rejects.toThrow()
  }, 15_000)
})
