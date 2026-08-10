async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return !!(data && data.session && data.session.id)
  } catch {
    return false
  }
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return
  const current = window.location.pathname
  if (current.startsWith("/login") || current.startsWith("/signup")) return
  window.location.assign("/login")
}

interface ApiFetchOptions {
  reauth?: boolean
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const reauth = options.reauth !== false

  const res = await fetch(input, init)

  if (res.status === 401 && reauth) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return fetch(input, init)
    }
    redirectToLogin()
  }

  return res
}