import { NextRequest, NextResponse } from "next/server"
import { verifyState, verifyStateCookie, exchangeCodeForToken, postProcessConnection } from "@/integrations/oauth"
import { getEnv } from "@/lib/env"
import { logger } from "@/lib/logger"

function getBaseUrl(): string {
  return getEnv("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "")
}

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const provider = params.provider
  const baseUrl = getBaseUrl()

  const redirectHome = (error: string, providerName: string) =>
    NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${encodeURIComponent(error)}&provider=${providerName}`, baseUrl),
    )

  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      const errorMsg = error.replace(/_/g, " ").trim()
      logger.warn("Integration OAuth returned an error", { provider, error: errorMsg.slice(0, 300) })
      return redirectHome(errorMsg, provider)
    }

    if (!code || !state) {
      return redirectHome("Missing authorization code", provider)
    }

    const verified = verifyState(state)
    if (!verified || verified.provider !== provider) {
      logger.warn("Integration OAuth state invalid", { provider })
      return redirectHome("Invalid state parameter. Please try again.", provider)
    }

    // Bind the callback to the browser flow that started it. The cookie is set
    // when auth is initiated; if present it must match the state param.
    const cookieHeader = req.headers.get("cookie")
    if (cookieHeader && !verifyStateCookie(state, cookieHeader)) {
      logger.warn("Integration OAuth state/cookie mismatch", { provider })
      return redirectHome("Invalid state parameter. Please try again.", provider)
    }

    const credentials = await exchangeCodeForToken(provider, code, baseUrl)

    await postProcessConnection(provider, verified.clinicId, credentials)

    logger.info("Integration OAuth callback succeeded", { provider, clinicId: verified.clinicId })

    return NextResponse.redirect(
      new URL(`/dashboard/integrations?success=${provider} connected&provider=${provider}`, baseUrl),
    )
  } catch (err: any) {
    logger.error("Integration OAuth callback failed", { provider, reason: err?.message?.slice(0, 300) })
    return redirectHome("Connection could not be completed. Please try again.", provider)
  }
}
