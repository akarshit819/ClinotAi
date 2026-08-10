export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/verify-email",
  "/api/health",
  "/api/webhooks",
  "/api/chat",
  "/api/widget",
  "/api/checkout",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/sessions",
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/refresh",
]

export const AUTH_ROUTES_PUBLIC = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/refresh",
  "/api/auth/verify-email",
  "/api/auth/sessions",
  "/api/auth/change-password",
]

export const CSRF_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/chat",
  "/api/widget",
  "/api/webhooks",
  "/api/checkout",
]

export const ONBOARDING_EXEMPT_PATHS = ["/api/onboarding", "/api/auth/logout", "/api/auth/me", "/api/auth/refresh"]

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

export function shouldBypassCsrf(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some((p) => pathname.startsWith(p))
}

export function isAuthRoutePublic(pathname: string): boolean {
  return AUTH_ROUTES_PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))
}