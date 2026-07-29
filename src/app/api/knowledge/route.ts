import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getClinicId, apiError } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicId(request)
    const knowledgeBase = await prisma.knowledgeBase.findMany({
      where: { clinicId },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(knowledgeBase)
  } catch {
    return apiError("Failed to fetch knowledge base")
  }
}

export async function POST(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const contentType = req.headers.get("content-type") || ""

    if (contentType.includes("multipart/form-data")) {
      return handleFileUpload(req, clinicId)
    }

    const { question, answer, category, source } = await req.json()

    if (!question || !answer) {
      return NextResponse.json({ error: "Question and answer are required" }, { status: 400 })
    }

    const entry = await prisma.knowledgeBase.create({
      data: {
        question: question.trim(),
        answer: answer.trim(),
        category: category?.trim() || null,
        source: source?.trim() || "manual",
        clinicId,
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch {
    return apiError("Failed to create knowledge entry")
  }
}

export async function PATCH(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const { id, question, answer, category } = await req.json()

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const entry = await prisma.knowledgeBase.update({
      where: { id, clinicId },
      data: {
        ...(question !== undefined && { question: question.trim() }),
        ...(answer !== undefined && { answer: answer.trim() }),
        ...(category !== undefined && { category: category.trim() || null }),
      },
    })

    return NextResponse.json(entry)
  } catch {
    return apiError("Failed to update knowledge entry")
  }
}

export async function DELETE(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    await prisma.knowledgeBase.delete({ where: { id, clinicId } })
    return NextResponse.json({ success: true })
  } catch {
    return apiError("Failed to delete knowledge entry")
  }
}

async function handleFileUpload(req: Request, clinicId: string) {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const source = formData.get("source") as string | null

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 })
  }

  const fileName = file.name.toLowerCase()
  let text = ""

  if (!fileName.endsWith(".txt") && !fileName.endsWith(".csv")) {
    return NextResponse.json({ error: "Unsupported file format. Supported: .txt, .csv" }, { status: 400 })
  }

  text = await file.text()
  const lines = text.split("\n").filter((l) => l.trim()).slice(0, 200)
  const entries = []

  for (const line of lines) {
    const parts = line.split(",").map((s) => s.trim())
    if (parts.length >= 2) {
      entries.push({
        question: parts[0].slice(0, 500),
        answer: parts.slice(1).join(",").slice(0, 2000),
        source: source || "file-upload",
        clinicId,
      })
    } else if (line.trim()) {
      entries.push({
        question: `From file: ${file.name}`,
        answer: line.trim().slice(0, 2000),
        source: source || "file-upload",
        clinicId,
      })
    }
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "No usable content found in file" }, { status: 400 })
  }

  await prisma.knowledgeBase.createMany({ data: entries })
  return NextResponse.json({ count: entries.length, message: `${entries.length} entries imported from ${file.name}` }, { status: 201 })
}
