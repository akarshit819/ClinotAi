import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { encrypt } from "@/lib/encryption"
import { getClinicId } from "@/lib/api"

export async function GET(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { useClinotAi: true, aiProvider: true },
    })
    if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 })

    const apiConfigs = await prisma.apiConfig.findMany({
      where: { clinicId },
      select: { provider: true, model: true, apiKey: true },
    })

    const providers: Record<string, { key: string; model: string; active: boolean }> = {}
    for (const cfg of apiConfigs) {
      providers[cfg.provider] = {
        key: "••••••••",
        model: cfg.model || "gpt-4o",
        active: !!cfg.apiKey,
      }
    }

    return NextResponse.json({
      useClinotAi: clinic.useClinotAi,
      aiProvider: clinic.aiProvider,
      providers,
    })
  } catch (error) {
    const err = error as { message?: string }
    if (err?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    console.error("AI providers GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json()

    if (body.useClinotAi === true) {
      await prisma.clinic.update({
        where: { id: clinicId },
        data: { useClinotAi: true, aiProvider: "clinot" },
      })
      return NextResponse.json({ success: true })
    }

    if (body.disconnectProvider) {
      await prisma.apiConfig.deleteMany({
        where: { clinicId, provider: body.disconnectProvider },
      })
      return NextResponse.json({ success: true })
    }

    if (body.apiKey && body.provider) {
      const encryptedKey = encrypt(body.apiKey.trim())

      await prisma.apiConfig.upsert({
        where: { clinicId_provider: { clinicId, provider: body.provider } },
        update: { apiKey: encryptedKey, model: body.model || "gpt-4o" },
        create: {
          clinicId,
          provider: body.provider,
          apiKey: encryptedKey,
          model: body.model || "gpt-4o",
        },
      })

      await prisma.clinic.update({
        where: { id: clinicId },
        data: { useClinotAi: false, aiProvider: body.provider },
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  } catch (error) {
    const err = error as { message?: string }
    if (err?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    console.error("AI providers PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
