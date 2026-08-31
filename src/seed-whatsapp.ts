import { prisma } from "./lib/db"
import { storeCredentials } from "./integrations/token-store"
import { validateManualConfig, getBusinesses, registerWebhook } from "./integrations/whatsapp/api"

async function main() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const wabaId = process.env.WHATSAPP_WABA_ID?.trim()
  const businessId = process.env.WHATSAPP_BUSINESS_ID?.trim() || ""

  if (!accessToken || !phoneNumberId || !wabaId) {
    console.log("[seed-whatsapp] Missing WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_WABA_ID - skipping")
    return
  }

  const config = { accessToken, phoneNumberId, wabaId, businessId }

  const validation = await validateManualConfig(config)
  if (!validation.ok || !validation.phoneNumber || !validation.waba) {
    console.log("[seed-whatsapp] Credential validation failed:", validation.error)
    return
  }

  const phone = validation.phoneNumber
  const waba = validation.waba

  let clinic = await prisma.clinic.findFirst({ where: { users: { some: { role: { name: "owner" } } } } })
  if (!clinic) clinic = await prisma.clinic.findFirst()
  if (!clinic) {
    console.log("[seed-whatsapp] No clinic found - skipping")
    return
  }

  let resolvedBusinessId = businessId
  if (!resolvedBusinessId) {
    const businesses = await getBusinesses(config.accessToken).catch(() => [])
    resolvedBusinessId = businesses[0]?.id || ""
  }

  const wabaRecord = await prisma.whatsAppBusinessAccount.upsert({
    where: { clinicId_wabaId: { clinicId: clinic.id, wabaId: config.wabaId } },
    update: {
      businessId: resolvedBusinessId,
      verifiedName: waba.name || "",
      currency: waba.currency || "USD",
      timezoneId: waba.timezoneId || "America/New_York",
      messageTemplateNamespace: waba.messageTemplateNamespace || null,
      status: "connected",
    },
    create: {
      clinicId: clinic.id,
      wabaId: config.wabaId,
      businessId: resolvedBusinessId,
      verifiedName: waba.name || "",
      currency: waba.currency || "USD",
      timezoneId: waba.timezoneId || "America/New_York",
      messageTemplateNamespace: waba.messageTemplateNamespace || null,
      status: "connected",
    },
  })

  await prisma.whatsAppPhoneNumber.upsert({
    where: { clinicId_phoneNumberId: { clinicId: clinic.id, phoneNumberId: config.phoneNumberId } },
    update: {
      displayPhoneNumber: phone.displayPhoneNumber,
      verifiedName: phone.verifiedName,
      qualityRating: phone.qualityRating,
      status: "connected",
    },
    create: {
      wabaId: wabaRecord.id,
      clinicId: clinic.id,
      phoneNumberId: config.phoneNumberId,
      displayPhoneNumber: phone.displayPhoneNumber,
      verifiedName: phone.verifiedName,
      qualityRating: phone.qualityRating,
      status: "connected",
    },
  })

  await storeCredentials(clinic.id, "whatsapp", {
    accessToken: config.accessToken,
    scopes: [],
    providerAccountName: phone.displayPhoneNumber || phone.verifiedName || config.phoneNumberId,
    metadata: {
      businessId: resolvedBusinessId,
      wabaId: config.wabaId,
      phoneNumberId: config.phoneNumberId,
      displayPhoneNumber: phone.displayPhoneNumber,
      verifiedName: phone.verifiedName,
    },
  })

  // Register the webhook against this deployment's own public URL. Never
  // fall back to a hardcoded third-party domain: without NEXT_PUBLIC_APP_URL
  // the subscription would point at the wrong server and silently break
  // inbound messages.
  const rawBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "")
  if (!rawBaseUrl) {
    console.warn(
      "[seed-whatsapp] NEXT_PUBLIC_APP_URL is not set — skipping webhook registration. " +
        "Set it to this deployment's public URL (e.g. https://your-app.example.com) so inbound WhatsApp messages reach the app."
    )
  }
  const subscribed = rawBaseUrl
    ? await registerWebhook(config, `${rawBaseUrl}/api/webhooks/whatsapp`)
    : false

  await prisma.whatsAppPhoneNumber.updateMany({
    where: { clinicId: clinic.id, phoneNumberId: config.phoneNumberId },
    data: { webhookConfigured: subscribed },
  })

  console.log(
    `[seed-whatsapp] WhatsApp connected for clinic ${clinic.id} (${phone.displayPhoneNumber}) webhookSubscribed=${subscribed}`,
  )
}

main()
  .catch((e) => {
    console.error("[seed-whatsapp] Failed:", e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
