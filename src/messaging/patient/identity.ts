import { prisma } from "@/lib/db"
import type { IncomingMessage } from "../types"

interface MatchResult {
  patientId?: string
  matched: boolean
  confidence: number
  reason: string
}

export async function resolvePatient(clinicId: string, message: IncomingMessage): Promise<MatchResult> {
  const { from, platform } = message

  const exactProfile = await prisma.patientPlatformProfile.findFirst({
    where: {
      platform,
      platformUserId: from.id,
      patient: { clinicId },
    },
    include: { patient: true },
  })

  if (exactProfile) {
    return { patientId: exactProfile.patient.id, matched: true, confidence: 1, reason: "exact_platform_match" }
  }

  const matches: { patientId: string; score: number; reason: string }[] = []

  if (from.phone) {
    const phonePatients = await prisma.patient.findMany({
      where: { clinicId, phone: from.phone },
      include: { platformProfiles: true },
    })
    for (const p of phonePatients) {
      matches.push({ patientId: p.id, score: 0.9, reason: "phone_match" })
    }
  }

  if (from.email) {
    const emailPatients = await prisma.patient.findMany({
      where: { clinicId, email: from.email },
      include: { platformProfiles: true },
    })
    for (const p of emailPatients) {
      const existing = matches.find((m) => m.patientId === p.id)
      if (existing) {
        existing.score = 1
        existing.reason = "phone_and_email_match"
      } else {
        matches.push({ patientId: p.id, score: 0.85, reason: "email_match" })
      }
    }
  }

  if (from.name) {
    const namePatients = await prisma.patient.findMany({
      where: { clinicId, name: { contains: from.name } },
      take: 5,
    })
    for (const p of namePatients) {
      if (!matches.find((m) => m.patientId === p.id)) {
        matches.push({ patientId: p.id, score: 0.5, reason: "name_match" })
      }
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score)
    const best = matches[0]

    await linkPlatformProfile(best.patientId, platform, from.id, from.name, from.phone, from.email)

    return { patientId: best.patientId, matched: true, confidence: best.score, reason: best.reason }
  }

  const patient = await prisma.patient.create({
    data: {
      clinicId,
      name: from.name,
      phone: from.phone,
      email: from.email,
      platformProfiles: {
        create: {
          platform,
          platformUserId: from.id,
          platformUserName: from.name,
          platformPhone: from.phone,
          platformEmail: from.email,
        },
      },
    },
  })

  return { patientId: patient.id, matched: false, confidence: 1, reason: "new_patient" }
}

export async function linkPlatformProfile(
  patientId: string,
  platform: string,
  platformUserId: string,
  platformUserName?: string,
  platformPhone?: string,
  platformEmail?: string,
): Promise<void> {
  const existing = await prisma.patientPlatformProfile.findFirst({
    where: { patientId, platform, platformUserId },
  })

  if (!existing) {
    await prisma.patientPlatformProfile.create({
      data: { patientId, platform, platformUserId, platformUserName, platformPhone, platformEmail },
    })
  }
}
