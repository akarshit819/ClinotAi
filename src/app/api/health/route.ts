import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getHealthSnapshot } from "@/lib/jobs/worker"

export const dynamic = "force-dynamic"

export async function GET() {
  const checks: Record<string, string> = {}

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = "ok"
  } catch {
    checks.database = "error"
  }

  // Internal background job processor status (single-service architecture).
  // The processor retrying never flips the whole service unhealthy — the
  // HTTP layer is independent — but it is surfaced here for observability.
  let jobProcessor: Record<string, unknown> = { running: false }
  try {
    jobProcessor = getHealthSnapshot()
  } catch {
    // Health must never crash because of the processor
  }

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
