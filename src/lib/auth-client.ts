import { isProduction } from "./env"

export function removeTokenCookie(): string {
  const parts = ["access_token=", "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"]
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
