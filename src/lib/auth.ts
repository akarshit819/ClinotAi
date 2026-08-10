import crypto from "crypto"
import bcrypt from "bcryptjs"
import { argon2id } from "hash-wasm"
import { prisma } from "./db"
import { getJwtSecret, getEncryptionKey, isProduction } from "./env"
import { normalizeEmail } from "./email-utils"
import { getDefaultPermissions } from "./permissions"
import { recordAuditEvent } from "./security/audit"

export interface JWTPayload {
  userId: string
  clinicId: string
  roleId: string
  roleName: string
  sessionId: string
  email: string
}

const ACCESS_TOKEN_EXPIRY = 15 * 60
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60
const SESSION_EXPIRY = 30 * 24 * 60 * 60
const REMEMBER_ME_EXPIRY = 90 * 24 * 60 * 60
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000
const TOKEN_BYTES = 32
const RESET_TOKEN_EXPIRY = 60 * 60 * 1000
const VERIFY_TOKEN_EXPIRY = 24 * 60 * 60 * 1000

function base64url(data: string): string {
  return Buffer.from(data).toString("base64url")
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8")
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return Buffer.from(new Uint8Array(sig)).toString("base64url")
}

function generateRandomToken(bytes: number = TOKEN_BYTES): string {
  return crypto.randomBytes(bytes).toString("hex")
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
}

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: crypto.randomBytes(16),
    parallelism: 1,
    iterations: 3,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  })
}

async function argon2Verify(password: string, hash: string): Promise<boolean> {
  const parts = hash.split("$")
  if (parts.length !== 6 || parts[1] !== "argon2id") return false
  const params = parts[3].split(",")
  const m = parseInt(params[0].slice(2))
  const t = parseInt(params[1].slice(2))
  const p = parseInt(params[2].slice(2))
  const salt = parts[4]
  const expected = await argon2id({
    password,
    salt: Buffer.from(salt, "base64"),
    parallelism: p,
    iterations: t,
    memorySize: m,
    hashLength: 32,
    outputType: "encoded",
  })
  return hash === expected
}

export interface PasswordVerificationResult {
  ok: boolean
  needsRehash: boolean
}

export async function verifyPassword(password: string, passwordHash: string): Promise<PasswordVerificationResult> {
  if (!password || !passwordHash) return { ok: false, needsRehash: false }

  if (passwordHash.startsWith("$argon2")) {
    try {
      const ok = await argon2Verify(password, passwordHash)
      return { ok, needsRehash: false }
    } catch {
      return { ok: false, needsRehash: false }
    }
  }

  if (passwordHash.startsWith("$2a$") || passwordHash.startsWith("$2b$") || passwordHash.startsWith("$2y$")) {
    try {
      const ok = await bcrypt.compare(password, passwordHash)
      return { ok, needsRehash: ok }
    } catch {
      return { ok: false, needsRehash: false }
    }
  }

  return { ok: false, needsRehash: false }
}

export async function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  const result = await verifyPassword(password, passwordHash)
  return result.ok
}

export function checkPasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < 10) return { valid: false, message: "Password must be at least 10 characters" }
  if (!/[A-Z]/.test(password)) return { valid: false, message: "Password must contain an uppercase letter" }
  if (!/[a-z]/.test(password)) return { valid: false, message: "Password must contain a lowercase letter" }
  if (!/[0-9]/.test(password)) return { valid: false, message: "Password must contain a number" }
  if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, message: "Password must contain a special character" }
  return { valid: true, message: "" }
}

async function signJWT(payload: JWTPayload, expiresIn: number): Promise<string> {
  const secret = getJwtSecret()
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const now = Math.floor(Date.now() / 1000)
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }))
  const sig = await hmacSign(`${header}.${body}`, secret)
  return `${header}.${body}.${sig}`
}

async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const secret = getJwtSecret()
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = await hmacSign(`${header}.${body}`, secret)
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(base64urlDecode(body))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return {
      userId: payload.userId,
      clinicId: payload.clinicId,
      roleId: payload.roleId,
      roleName: payload.roleName,
      sessionId: payload.sessionId,
      email: payload.email,
    }
  } catch {
    return null
  }
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
  sessionId: string
  expiresAt: Date
}

export async function createSession(
  userId: string,
  clinicId: string,
  rememberMe: boolean,
  ip: string,
  userAgent: string,
): Promise<SessionTokens> {
  const sessionToken = generateRandomToken()
  const refreshToken = generateRandomToken()
  const sessionId = crypto.createHash("sha256").update(sessionToken).digest("hex").slice(0, 16)

  const sessionExpiry = rememberMe ? REMEMBER_ME_EXPIRY : SESSION_EXPIRY
  const expiresAt = new Date(Date.now() + sessionExpiry * 1000)

  const refreshFamily = generateRandomToken(16)

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      clinicId,
      tokenHash: hashToken(sessionToken),
      refreshTokenHash: hashToken(refreshToken),
      ipAddress: ip,
      userAgent,
      isActive: true,
      lastActiveAt: new Date(),
      expiresAt,
    },
  })

  await prisma.refreshToken.create({
    data: {
      userId,
      clinicId,
      sessionId,
      tokenHash: hashToken(refreshToken),
      family: refreshFamily,
      expiresAt: new Date(Date.now() + sessionExpiry * 1000),
    },
  })

  const user = await prisma.user.findUnique({ where: { id: userId } })
  const role = user ? await prisma.role.findUnique({ where: { id: user.roleId } }) : null

  const accessToken = await signJWT(
    { userId, clinicId, roleId: user?.roleId || "", roleName: role?.name || "staff", sessionId, email: user?.email || "" },
    ACCESS_TOKEN_EXPIRY,
  )

  return { accessToken, refreshToken: `${sessionId}.${refreshToken}`, sessionId, expiresAt }
}

export async function refreshSession(
  refreshToken: string,
  ip: string,
  userAgent: string,
): Promise<SessionTokens | null> {
  const parts = refreshToken.split(".")
  if (parts.length !== 2) return null
  const [sessionId, token] = parts
  const tokenHash = hashToken(token)

  const stored = await prisma.refreshToken.findFirst({
    where: { sessionId, tokenHash, isRevoked: false, expiresAt: { gt: new Date() } },
    include: { user: { include: { role: true } } },
  })

  if (!stored) return null

  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session || !session.isActive || session.expiresAt < new Date()) return null

  await prisma.refreshToken.updateMany({
    where: { family: stored.family, isRevoked: false },
    data: { isRevoked: true, revokedAt: new Date() },
  })

  const newRefreshToken = generateRandomToken()
  const newRefreshFamily = generateRandomToken(16)

  await prisma.refreshToken.create({
    data: {
      userId: stored.userId,
      clinicId: stored.clinicId,
      sessionId,
      tokenHash: hashToken(newRefreshToken),
      family: newRefreshFamily,
      expiresAt: session.expiresAt,
    },
  })

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      refreshTokenHash: hashToken(newRefreshToken),
      lastActiveAt: new Date(),
      ipAddress: ip,
      userAgent,
    },
  })

  const accessToken = await signJWT(
    {
      userId: stored.userId,
      clinicId: stored.clinicId,
      roleId: stored.user.roleId,
      roleName: stored.user.role.name,
      sessionId,
      email: stored.user.email,
    },
    ACCESS_TOKEN_EXPIRY,
  )

  return {
    accessToken,
    refreshToken: `${sessionId}.${newRefreshToken}`,
    sessionId,
    expiresAt: session.expiresAt,
  }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { sessionId }, data: { isRevoked: true, revokedAt: new Date() } }),
    prisma.session.update({ where: { id: sessionId }, data: { isActive: false } }),
  ])
}

export async function revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  const where = exceptSessionId ? { userId, id: { not: exceptSessionId } } : { userId }
  const sessions = await prisma.session.findMany({ where, select: { id: true } })
  const sessionIds = sessions.map((s) => s.id)

  if (sessionIds.length === 0) return
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { sessionId: { in: sessionIds } }, data: { isRevoked: true, revokedAt: new Date() } }),
    prisma.session.updateMany({ where: { id: { in: sessionIds } }, data: { isActive: false } }),
  ])
}

export async function getActiveSessions(userId: string): Promise<any[]> {
  return prisma.session.findMany({
    where: { userId, isActive: true, expiresAt: { gt: new Date() } },
    select: { id: true, ipAddress: true, userAgent: true, deviceName: true, lastActiveAt: true, createdAt: true },
    orderBy: { lastActiveAt: "desc" },
  })
}

export async function authenticateUser(
  email: string,
  password: string,
  ip: string,
  userAgent: string,
  rememberMe: boolean = false,
): Promise<{ user: any; session: SessionTokens } | { error: string; status: number }> {
  const normalizedEmail = normalizeEmail(email)

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { role: true },
  })

  if (!user) {
    await recordAuditEvent({ action: "login.failure", clinicId: "", userId: "", ip, userAgent, details: { reason: "user_not_found", email: normalizedEmail }, severity: "warning" })
    return { error: "Invalid email or password", status: 401 }
  }

  if (!user.isActive) {
    await recordAuditEvent({ action: "login.failure", clinicId: user.clinicId, userId: user.id, ip, userAgent, details: { reason: "account_disabled" }, severity: "warning" })
    return { error: "This account has been disabled", status: 403 }
  }

  if (user.isLocked && user.lockedUntil && user.lockedUntil > new Date()) {
    const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000 / 60)
    await recordAuditEvent({ action: "login.failure", clinicId: user.clinicId, userId: user.id, ip, userAgent, details: { reason: "account_locked" }, severity: "warning" })
    return { error: `Account locked. Try again in ${remaining} minutes.`, status: 429 }
  }

  const verification = await verifyPassword(password, user.passwordHash)
  if (!verification.ok) {
    const attempts = user.failedLoginAttempts + 1
    const updateData: any = { failedLoginAttempts: attempts }
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      updateData.isLocked = true
      updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION)
    }
    await prisma.user.update({ where: { id: user.id }, data: updateData })
    await recordAuditEvent({ action: "login.failure", clinicId: user.clinicId, userId: user.id, ip, userAgent, details: { reason: "invalid_password", attempts }, severity: "warning" })
    return { error: "Invalid email or password", status: 401 }
  }

  const updateData: any = { failedLoginAttempts: 0, isLocked: false, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip }
  if (verification.needsRehash) {
    updateData.passwordHash = await hashPassword(password)
  }
  await prisma.user.update({ where: { id: user.id }, data: updateData })

  const session = await createSession(user.id, user.clinicId, rememberMe, ip, userAgent)

  await recordAuditEvent({ action: "login.success", clinicId: user.clinicId, userId: user.id, ip, userAgent, details: { sessionId: session.sessionId, rememberMe }, severity: "info" })

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role.name, clinicId: user.clinicId },
    session,
  }
}

export async function checkAccountLockout(email: string): Promise<{ locked: boolean; remainingMinutes?: number }> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
  if (!user || !user.isLocked || !user.lockedUntil) return { locked: false }
  if (user.lockedUntil <= new Date()) {
    await prisma.user.update({ where: { id: user.id }, data: { isLocked: false, lockedUntil: null } })
    return { locked: false }
  }
  return { locked: true, remainingMinutes: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000 / 60) }
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = generateRandomToken()
  const tokenHash = hashToken(token)
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY) },
  })
  return token
}

export async function verifyPasswordResetToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token)
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!record || record.usedAt || record.expiresAt < new Date()) return null
  return record.userId
}

export async function consumePasswordResetToken(token: string): Promise<boolean> {
  const tokenHash = hashToken(token)
  const result = await prisma.passwordResetToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  return result.count > 0
}

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = generateRandomToken()
  const tokenHash = hashToken(token)
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + VERIFY_TOKEN_EXPIRY) },
  })
  return token
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  const tokenHash = hashToken(token)
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } })
  if (!record || record.usedAt || record.expiresAt < new Date()) return false
  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { isEmailVerified: true } }),
  ])
  return true
}

export function createTokenCookie(
  name: string,
  value: string,
  maxAge: number,
  sameSite: "Strict" | "Lax" = "Strict",
  path: string = "/",
): string {
  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
  ]
  if (isProduction()) parts.push("Secure")
  return parts.join("; ")
}

export function clearCookie(name: string, path: string = "/"): string {
  const parts = [`${name}=`, `Path=${path}`, "HttpOnly", "SameSite=Strict", "Max-Age=0"]
  if (isProduction()) parts.push("Secure")
  return parts.join("; ")
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7)
  const cookieHeader = request.headers.get("cookie") || ""
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)access_token=([^;]+)`))
  return match ? match[1] : null
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  const payload = await verifyJWT(token)
  if (!payload) return null

  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } })
  if (!session || !session.isActive || session.expiresAt < new Date()) return null

  return payload
}

const DEFAULT_ROLE_NAMES = ["owner", "admin", "staff"]

export async function ensureClinicRoles(tx: any, clinicId: string): Promise<Record<string, string>> {
  const roleIds: Record<string, string> = {}
  for (const roleName of DEFAULT_ROLE_NAMES) {
    const permissions = await tx.permission.findMany({
      where: { code: { in: getDefaultPermissions(roleName) } },
      select: { id: true },
    })
    const role = await tx.role.create({
      data: {
        clinicId,
        name: roleName,
        description: `Default ${roleName} role`,
        isSystem: true,
      },
    })
    for (const perm of permissions) {
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } })
    }
    roleIds[roleName] = role.id
  }
  return roleIds
}

function generateClinicSlug(clinicName: string): string {
  const base = clinicName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return `${base || "clinic"}-${generateRandomToken(4)}`
}

export async function registerClinic(data: {
  name: string
  email: string
  password: string
  clinicName: string
  ip: string
  userAgent: string
}): Promise<{ user: any; session: SessionTokens } | { error: string; status: number }> {
  const email = normalizeEmail(data.email)
  const name = data.name.trim()
  const clinicName = data.clinicName.trim()

  const strength = checkPasswordStrength(data.password)
  if (!strength.valid) return { error: strength.message, status: 400 }

  if (!email) return { error: "Valid email is required", status: 400 }
  if (!clinicName) return { error: "Clinic name is required", status: 400 }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: "An account with this email already exists. Please log in instead.", status: 409 }

  const passwordHash = await hashPassword(data.password)
  const slug = generateClinicSlug(clinicName)

  let user: any
  let clinic: any

  try {
    const created = await prisma.$transaction(async (tx) => {
      const newClinic = await tx.clinic.create({
        data: { name: clinicName, slug },
      })

      const roleIds = await ensureClinicRoles(tx, newClinic.id)

      const newUser = await tx.user.create({
        data: {
          clinicId: newClinic.id,
          email,
          passwordHash,
          name,
          roleId: roleIds.owner,
        },
        include: { role: true },
      })

      return { user: newUser, clinic: newClinic }
    })

    user = created.user
    clinic = created.clinic
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "An account with this email already exists. Please log in instead.", status: 409 }
    }
    throw error
  }

  const session = await createSession(user.id, clinic.id, false, data.ip, data.userAgent)

  await recordAuditEvent({
    action: "signup", clinicId: clinic.id, userId: user.id, ip: data.ip, userAgent: data.userAgent,
    details: { email, clinicName },
    severity: "info",
  })

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role.name, clinicId: clinic.id },
    session,
  }
}