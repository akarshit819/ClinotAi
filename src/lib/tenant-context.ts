import { AsyncLocalStorage } from "async_hooks"

export interface TenantContext {
  clinicId: string
  userId: string
  roleId: string
  roleName: string
  permissions: Set<string>
  email: string
  name: string
}

const storage = new AsyncLocalStorage<TenantContext>()

export function getTenantContext(): TenantContext | null {
  return storage.getStore() ?? null
}

export function requireTenantContext(): TenantContext {
  const ctx = storage.getStore()
  if (!ctx) throw new Error("No tenant context available")
  return ctx
}

export function runWithTenant<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn)
}

export function hasPermission(code: string): boolean {
  const ctx = getTenantContext()
  if (!ctx) return false
  if (ctx.roleName === "owner") return true
  return ctx.permissions.has(code)
}

export function requirePermission(code: string): void {
  if (!hasPermission(code)) {
    const err = new Error("Forbidden: insufficient permissions")
    ;(err as any).statusCode = 403
    throw err
  }
}

export function getCurrentClinicId(): string {
  const ctx = requireTenantContext()
  return ctx.clinicId
}

export function getCurrentUserId(): string {
  const ctx = requireTenantContext()
  return ctx.userId
}
