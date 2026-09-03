import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import fs from "fs"
import os from "os"
import path from "path"

export const dynamic = "force-dynamic"

/**
 * The internal job processor runs in the production launcher process
 * (see scripts/start-production.js). The Next.js HTTP server runs in
 * a child process. They cannot share in-memory state, so the launcher
 * periodically writes the worker's health snapshot to a JSON file
 * under os.tmpdir(). This route reads that file and reports the
 * worker's status alongside the rest of the system.
 *
 * If the file is absent or stale (>5s old), the worker is considered
 * unreachable. The HTTP layer is independent of the worker, so a
 * missing or stale snapshot does NOT flip the whole service unhealthy.
 */
function readWorkerSnapshot(): Record<string, unknown> {
  const file = process.env.CLINOT_WORKER_HEALTH_FILE || path.join(os.tmpdir(), "clinot-worker-health.json")
  try {
    const raw = fs.readFileSync(file, "utf8")
    const parsed = JSON.parse(raw) as { writtenAt?: number } & Record<string, unknown>
    const ageMs = typeof parsed.writtenAt === "number" ? Date.now() - parsed.writtenAt : Infinity
    if (ageMs > 5_000) {
      return { running: false, database: "unreachable", status: "degraded", ageMs }
    }
    return parsed
  } catch {
    return { running: false, database: "unreachable", status: "degraded" }
  }
}

export async function GET() {
  const checks: Record<string, string> = {}

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = "ok"
  } catch {
    checks.database = "error"
  }

  const jobProcessor = readWorkerSnapshot()

  const allOk = Object.values(checks).every((v) => v === "ok")

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
      checks,
      jobProcessor,
    },
    {
      status: allOk ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
