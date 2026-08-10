import { describe, it, expect, vi, beforeEach } from "vitest"
import bcrypt from "bcryptjs"

vi.mock("@/lib/db", () => {
  const mock: Record<string, any> = {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    clinic: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    role: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    rolePermission: { create: vi.fn(), upsert: vi.fn() },
    permission: { findMany: vi.fn() },
    session: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    refreshToken: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  mock.$transaction = vi.fn(async (arg: any) => {
    if (typeof arg === "function") return await arg(mock)
    return Promise.resolve(arg)
  })
  return { prisma: mock }
})

import { prisma } from "@/lib/db"
import {
  hashPassword,
  verifyPassword,
  comparePassword,
  checkPasswordStrength,
  authenticateUser,
  registerClinic,
  revokeSession,
  createTokenCookie,
} from "@/lib/auth"
import { normalizeEmail, isValidEmail } from "@/lib/email-utils"
import { isPublicPath, shouldBypassCsrf } from "@/lib/routing"

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.$transaction as any).mockReset()
  ;(prisma.$transaction as any).mockImplementation(async (arg: any) => {
    if (typeof arg === "function") return await arg(prisma)
    return Promise.resolve(arg)
  })
})

function makeUser(overrides: any = {}) {
  return {
    id: "user_1",
    clinicId: "clinic_1",
    email: "owner@clinic.com",
    passwordHash: "",
    name: "Dr. Smith",
    roleId: "role_owner",
    role: { name: "owner" },
    isActive: true,
    isLocked: false,
    lockedUntil: null,
    failedLoginAttempts: 0,
    lastLoginAt: null,
    lastLoginIp: null,
    passwordChangedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  Owner@Clinic.COM ")).toBe("owner@clinic.com")
  })

  it("handles missing input", () => {
    expect(normalizeEmail("")).toBe("")
    expect(normalizeEmail(undefined as unknown as string)).toBe("")
  })

  it("validates email format", () => {
    expect(isValidEmail("test@clinic.com")).toBe(true)
    expect(isValidEmail("  test@clinic.com  ")).toBe(false)
    expect(isValidEmail("not-an-email")).toBe(false)
  })
})

describe("checkPasswordStrength", () => {
  it("accepts a strong password", () => {
    const result = checkPasswordStrength("StrongPass123!")
    expect(result.valid).toBe(true)
  })

  it("rejects weak passwords", () => {
    expect(checkPasswordStrength("short").valid).toBe(false)
    expect(checkPasswordStrength("alllowercase123!").valid).toBe(false)
    expect(checkPasswordStrength("NOUPPERCASE123!").valid).toBe(false)
    expect(checkPasswordStrength("NoNumbers!").valid).toBe(false)
  })
})

describe("password hashing and verification", () => {
  it("hashes and verifies a password (round-trip)", async () => {
    const hash = await hashPassword("StrongPass123!")
    const result = await verifyPassword("StrongPass123!", hash)
    expect(result.ok).toBe(true)
    expect(result.needsRehash).toBe(false)
  })

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("StrongPass123!")
    const result = await verifyPassword("WrongPass456!", hash)
    expect(result.ok).toBe(false)
  })

  it("verifies legacy bcrypt hashes and flags rehash", async () => {
    const bcryptHash = await bcrypt.hash("LegacyPass123!", 10)
    const result = await verifyPassword("LegacyPass123!", bcryptHash)
    expect(result.ok).toBe(true)
    expect(result.needsRehash).toBe(true)
  })

  it("rejects a wrong legacy bcrypt password", async () => {
    const bcryptHash = await bcrypt.hash("LegacyPass123!", 10)
    const result = await verifyPassword("WrongPass456!", bcryptHash)
    expect(result.ok).toBe(false)
  })

  it("comparePassword matches verifyPassword", async () => {
    const hash = await hashPassword("StrongPass123!")
    expect(await comparePassword("StrongPass123!", hash)).toBe(true)
    expect(await comparePassword("Wrong", hash)).toBe(false)
  })
})

describe("authenticateUser", () => {
  it("logs in an existing user with correct credentials", async () => {
    const user = makeUser({ passwordHash: await hashPassword("StrongPass123!"), failedLoginAttempts: 0 })
    ;(prisma.user.findUnique as any).mockResolvedValue(user)
    ;(prisma.user.update as any).mockResolvedValue(user)
    ;(prisma.session.create as any).mockResolvedValue({})
    ;(prisma.refreshToken.create as any).mockResolvedValue({})
    ;(prisma.role.findUnique as any).mockResolvedValue({ name: "owner" })
    ;(prisma.auditLog.create as any).mockResolvedValue({})

    const result = await authenticateUser("  Owner@Clinic.COM ", "StrongPass123!", "127.0.0.1", "test-agent")

    expect("session" in result).toBe(true)
    if ("session" in result) {
      expect(result.user.email).toBe("owner@clinic.com")
      expect(result.user.role).toBe("owner")
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 0 }) }),
      )
    }
  })

  it("rejects a wrong password and does not create a session", async () => {
    const user = makeUser({ passwordHash: await hashPassword("StrongPass123!") })
    ;(prisma.user.findUnique as any).mockResolvedValue(user)
    ;(prisma.user.update as any).mockResolvedValue(user)
    ;(prisma.auditLog.create as any).mockResolvedValue({})

    const result = await authenticateUser("owner@clinic.com", "WrongPass456!", "127.0.0.1", "test-agent")

    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.status).toBe(401)
    }
    expect(prisma.session.create).not.toHaveBeenCalled()
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 1 }) }),
    )
  })

  it("returns a consistent error for unknown email", async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(null)
    ;(prisma.auditLog.create as any).mockResolvedValue({})

    const result = await authenticateUser("nobody@clinic.com", "Whatever123!", "127.0.0.1", "test-agent")

    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toBe("Invalid email or password")
      expect(result.status).toBe(401)
    }
  })

  it("silently rehashes a legacy bcrypt password on successful login", async () => {
    const user = makeUser({ passwordHash: await bcrypt.hash("LegacyPass123!", 10) })
    ;(prisma.user.findUnique as any).mockResolvedValue(user)
    ;(prisma.user.update as any).mockImplementation(async ({ data }: any) => {
      user.passwordHash = data.passwordHash ?? user.passwordHash
      return user
    })
    ;(prisma.session.create as any).mockResolvedValue({})
    ;(prisma.refreshToken.create as any).mockResolvedValue({})
    ;(prisma.role.findUnique as any).mockResolvedValue({ name: "owner" })
    ;(prisma.auditLog.create as any).mockResolvedValue({})

    const result = await authenticateUser("owner@clinic.com", "LegacyPass123!", "127.0.0.1", "test-agent")

    expect("session" in result).toBe(true)
    expect(user.passwordHash.startsWith("$argon2")).toBe(true)
  })
})

describe("registerClinic", () => {
  it("creates a clinic, default roles and user; then session", async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(null)
    ;(prisma.clinic.create as any).mockResolvedValue({ id: "clinic_new", name: "Smith Dental", slug: "smith-dental" })
    ;(prisma.permission.findMany as any).mockResolvedValue([])
    ;(prisma.role.create as any)
      .mockResolvedValueOnce({ id: "role_owner" })
      .mockResolvedValueOnce({ id: "role_admin" })
      .mockResolvedValueOnce({ id: "role_staff" })
    ;(prisma.user.create as any).mockImplementation(async ({ data }: any) => ({
      id: "user_new",
      clinicId: data.clinicId,
      email: data.email,
      name: data.name,
      roleId: data.roleId,
      role: { name: "owner" },
      passwordHash: data.passwordHash,
    }))
    ;(prisma.session.create as any).mockResolvedValue({})
    ;(prisma.refreshToken.create as any).mockResolvedValue({})
    ;(prisma.role.findUnique as any).mockResolvedValue({ name: "owner" })
    ;(prisma.auditLog.create as any).mockResolvedValue({})

    const result = await registerClinic({
      name: "Dr. Jones",
      email: "  Dr.Jones@Clinic.COM ",
      password: "StrongPass123!",
      clinicName: "Jones Dental",
      ip: "127.0.0.1",
      userAgent: "test-agent",
    })

    expect("session" in result).toBe(true)
    if ("session" in result) {
      expect(result.user.email).toBe("dr.jones@clinic.com")
      expect(prisma.role.create).toHaveBeenCalledTimes(3)
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "dr.jones@clinic.com" }) }),
      )
    }
  })

  it("rejects signup when email already exists (no duplicate created)", async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(makeUser())

    const result = await registerClinic({
      name: "Dr. Jones",
      email: "owner@clinic.com",
      password: "StrongPass123!",
      clinicName: "Jones Dental",
      ip: "127.0.0.1",
      userAgent: "test-agent",
    })

    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.status).toBe(409)
    }
    expect(prisma.clinic.create).not.toHaveBeenCalled()
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it("handles concurrent duplicate signup race gracefully (unique constraint)", async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(null)
    ;(prisma.$transaction as any).mockRejectedValueOnce({ code: "P2002", meta: { target: "User.email" } })

    const result = await registerClinic({
      name: "Dr. Jones",
      email: "race@clinic.com",
      password: "StrongPass123!",
      clinicName: "Jones Dental",
      ip: "127.0.0.1",
      userAgent: "test-agent",
    })

    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.status).toBe(409)
    }
  })

  it("propagates unexpected failures so the route returns a generic error", async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(null)
    ;(prisma.clinic.create as any).mockResolvedValue({ id: "clinic_x", name: "X", slug: "x" })
    ;(prisma.permission.findMany as any).mockResolvedValue([])
    ;(prisma.role.create as any).mockRejectedValue(new Error("boom"))

    await expect(registerClinic({
      name: "Dr. Jones",
      email: "dr.jones@clinic.com",
      password: "StrongPass123!",
      clinicName: "Jones Dental",
      ip: "127.0.0.1",
      userAgent: "test-agent",
    })).rejects.toThrow("boom")
  })
})

describe("session helpers", () => {
  it("revokeSession invalidates the refresh tokens and session", async () => {
    ;(prisma.$transaction as any).mockImplementation(async (ops: any[]) => Promise.all(ops))

    await revokeSession("session_1")

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { sessionId: "session_1" },
      data: expect.objectContaining({ isRevoked: true }),
    })
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: "session_1" },
      data: expect.objectContaining({ isActive: false }),
    })
  })

  it("creates secure HttpOnly cookies", () => {
    const cookie = createTokenCookie("access_token", "abc123", 900, "Lax")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Lax")
    expect(cookie).toContain("Max-Age=900")
  })
})

describe("routing guards", () => {
  it("treats login/register/refresh/logout as pass-through routes", () => {
    expect(isPublicPath("/api/auth/login")).toBe(true)
    expect(isPublicPath("/api/auth/register")).toBe(true)
    expect(isPublicPath("/api/auth/refresh")).toBe(true)
    expect(isPublicPath("/api/auth/logout")).toBe(true)
    expect(isPublicPath("/api/auth/verify-email")).toBe(true)
  })

  it("still guards protected API paths", () => {
    expect(isPublicPath("/api/leads")).toBe(false)
    expect(isPublicPath("/api/billing")).toBe(false)
    expect(isPublicPath("/dashboard")).toBe(false)
  })

  it("only bypasses CSRF for designated public endpoints", () => {
    expect(shouldBypassCsrf("/api/auth/login")).toBe(true)
    expect(shouldBypassCsrf("/api/auth/register")).toBe(true)
    expect(shouldBypassCsrf("/api/auth/forgot-password")).toBe(true)
    expect(shouldBypassCsrf("/api/auth/refresh")).toBe(false)
  })
})