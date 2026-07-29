import { NextRequest, NextResponse } from "next/server"
import { verifyState } from "@/integrations/oauth"
import { exchangeCodeForToken, postProcessConnection } from "@/integrations/oauth"
import { getEnv } from "@/lib/env"

function getBaseUrl(): string {
  return getEnv("NEXT_PUBLIC_APP_URL")
}

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  try {
    const provider = params.provider
    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    const baseUrl = getBaseUrl()

    if (error) {
      const errorMsg = decodeURIComponent(error.replace(/_/g, " "))
      return NextResponse.redirect(
        new URL(`/dashboard/integrations?error=${encodeURIComponent(errorMsg)}&provider=${provider}`, baseUrl),
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL(`/dashboard/integrations?error=Missing+authorization+code&provider=${provider}`, baseUrl),
      )
    }

    const verified = verifyState(state)
    if (!verified || verified.provider !== provider) {
      return NextResponse.redirect(
        new URL(`/dashboard/integrations?error=Invalid+state+parameter&provider=${provider}`, baseUrl),
      )
    }

    const credentials = await exchangeCodeForToken(provider, code, baseUrl)

    await postProcessConnection(provider, verified.clinicId, credentials)

    return NextResponse.redirect(
      new URL(`/dashboard/integrations?success=${provider}+connected&provider=${provider}`, baseUrl),
    )
  } catch (err: any) {
    const baseUrl = getBaseUrl()
    const errorMsg = encodeURIComponent(err.message || "OAuth callback failed")
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${errorMsg}&provider=${params.provider}`, baseUrl),
    )
  }
}
