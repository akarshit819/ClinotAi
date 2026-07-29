import { extractBearerToken, verifyAccessToken } from "./auth"
import { requireTenantContext, runWithTenant, getTenantContext } from "./tenant-context"
import { prisma } from "./db"
import type { TenantContext } from "./tenant-context"

export interface RequestAuth {
  authenticated: boolean
  userId?: string
  clinicId?: string
  roleId?: string
  roleName?: string
  sessionId?: string
  email?: string
  permissions?: string[]
}

export async function resolveRequestAuth(request: Request): Promise<RequestAuth> {
  const token = extractBearerToken(request)
  if (!token) return { authenticated: false }

  const payload = await verifyAccessToken(token)
  if (!payload) return { authenticated: false }

  const role = await prisma.role.findUnique({
    where: { id: payload.roleId },
    include: { permissions: { include: { permission: true } } },
  })

  const permissions = role ? role.permissions.map((rp) => rp.permission.code) : []

  return {
    authenticated: true,
    userId: payload.userId,
    clinicId: payload.clinicId,
    roleId: payload.roleId,
    roleName: payload.roleName,
    sessionId: payload.sessionId,
    email: payload.email,
    permissions,
  }
}

export function withTenantContext<T>(auth: RequestAuth, fn: () => Promise<T>): Promise<T> {
  if (!auth.authenticated || !auth.userId || !auth.clinicId || !auth.roleId || !auth.roleName) {
    throw new Error("Authentication required")
  }

  const context: TenantContext = {
    clinicId: auth.clinicId,
    userId: auth.userId,
    roleId: auth.roleId,
    roleName: auth.roleName,
    permissions: new Set(auth.permissions || []),
    email: auth.email || "",
    name: "",
  }

  return runWithTenant(context, fn)
}

export function getRequestAuth(): RequestAuth {
  const ctx = getTenantContext()
  if (!ctx) return { authenticated: false }
  return {
    authenticated: true,
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    roleId: ctx.roleId,
    roleName: ctx.roleName,
    email: ctx.email,
    permissions: Array.from(ctx.permissions),
  }
}
