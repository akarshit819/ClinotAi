import { NextResponse } from "next/server"
import { extractBearerToken, verifyAccessToken, createTokenCookie } from "@/lib/auth"
import { logger } from "@/lib/logger"

interface AuthResult {
  clinicId: string
  userId: string
  roleId: string
  roleName: string
  sessionId: string
  email: string
}

interface AuthResultNullable {
  clinicId: string | null
  userId: string | null
  roleId: string | null
  roleName: string | null
  sessionId: string | null
  email: string | null
}

export async function getClinicId(request: Request): Promise<AuthResult> {
  const token = extractBearerToken(request)
  if (!token) throw new AuthError("Authentication required")

  const payload = await verifyAccessToken(token)
  if (!payload) throw new AuthError("Authentication required")

  return {
    clinicId: payload.clinicId,
    userId: payload.userId,
    roleId: payload.roleId,
    roleName: payload.roleName,
    sessionId: payload.sessionId,
    email: payload.email,
  }
}

export async function getClinicIdOptional(request: Request): Promise<AuthResultNullable> {
  try {
    return await getClinicId(request)
  } catch {
    return { clinicId: null, userId: null, roleId: null, roleName: null, sessionId: null, email: null }
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

export function apiError(message: string, status = 500, code?: string): NextResponse {
  return NextResponse.json(
    { error: message, ...(code ? { code } : {}) },
    { status },
  )
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function handleApiError(error: unknown, defaultMessage = "Internal server error"): NextResponse {
  if (error instanceof AuthError) {
    return apiError(error.message, 401, "UNAUTHORIZED")
  }

  const err = error as { message?: string; statusCode?: number }
  if (err.statusCode === 403) {
    return apiError("Forbidden", 403, "FORBIDDEN")
  }
  if (err?.message?.includes("Invalid API key")) {
    return apiError("AI provider API key is invalid", 401, "INVALID_API_KEY")
  }
  if (err?.message?.includes("Rate limit exceeded")) {
    return apiError("Rate limit exceeded", 429, "RATE_LIMITED")
  }

  logger.error("API error", { error: err?.message })
  return apiError(defaultMessage, 500)
}

export function respondWithTokens(
  data: any,
  accessToken: string,
  refreshToken: string,
  accessMaxAge: number = 900,
  refreshMaxAge: number = 2592000,
): NextResponse {
  const response = NextResponse.json(data)
  response.headers.append("Set-Cookie", createTokenCookie("access_token", accessToken, accessMaxAge, "Lax"))
  response.headers.append("Set-Cookie", createTokenCookie("refresh_token", refreshToken, refreshMaxAge, "Lax"))
  return response
}
