import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { encrypt } from "@/lib/encryption"
import { getClinicId, apiError } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicId(request)
    const configs = await prisma.apiConfig.findMany({
      where: { clinicId },
    })
    return NextResponse.json(configs.map((c) => ({
      ...c,
      apiKey: c.apiKey ? "••••••••" : null,
    })))
  } catch {
    return apiError("Failed to fetch API config")
  }
}

export async function PUT(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const { provider, apiKey, model, temperature, maxTokens } = await req.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      model: model || "gpt-4o-mini",
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 512,
    }

    if (apiKey !== undefined) {
      if (apiKey && apiKey !== "••••••••") {
        updateData.apiKey = encrypt(apiKey.trim())
      }
    }

    const config = await prisma.apiConfig.upsert({
      where: { clinicId_provider: { clinicId, provider } },
      update: updateData,
      create: {
        clinicId,
        provider,
        model: model || "gpt-4o-mini",
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 512,
        apiKey: apiKey && apiKey !== "••••••••" ? encrypt(apiKey.trim()) : null,
      },
    })

    return NextResponse.json({ ...config, apiKey: config.apiKey ? "••••••••" : null })
  } catch {
    return apiError("Failed to save API config")
  }
}

export async function DELETE(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const { provider } = await req.json()
    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }
    await prisma.apiConfig.delete({
      where: { clinicId_provider: { clinicId, provider } },
    })
    return NextResponse.json({ success: true })
  } catch {
    return apiError("Failed to delete API config")
  }
}
