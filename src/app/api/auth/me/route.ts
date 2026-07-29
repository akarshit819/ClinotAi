import { NextRequest, NextResponse } from "next/server"
import { extractBearerToken, verifyAccessToken } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const payload = await verifyAccessToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true, clinic: { select: { name: true, slug: true, isOnboarded: true, onboardingStep: true, logo: true, timezone: true } } },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      roleId: user.roleId,
      clinicId: user.clinicId,
      clinicName: user.clinic.name,
      clinicSlug: user.clinic.slug,
      isOnboarded: user.clinic.isOnboarded,
      onboardingStep: user.clinic.onboardingStep,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    })
  } catch {
    return NextResponse.json({ error: "Failed to get user info" }, { status: 500 })
  }
}
