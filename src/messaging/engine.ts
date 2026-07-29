import { prisma } from "@/lib/db"
import { checkFeatureAccess } from "@/lib/billing"
import { processIncomingMessage } from "./pipeline"
import { getConnector } from "./connectors/registry"
import type { IncomingMessage, Platform } from "./types"

export { processIncomingMessage } from "./pipeline"
export { getConnector, getAllConnectors } from "./connectors/registry"
export * from "./types"
export * from "./inbox/service"

export async function ingestMessage(clinicId: string, message: IncomingMessage) {
  return processIncomingMessage(clinicId, message)
}

export async function handlePlatformWebhook(
  platform: Platform,
  body: any,
  headers: Record<string, string>,
): Promise<{ clinicId: string; result: any } | null> {
  const connector = getConnector(platform)
  if (!connector) return null

  const validation = connector.validateRequest(body, headers)
  if (!validation.valid) throw new Error(validation.error || "Invalid request")

  const integration = await prisma.integration.findFirst({
    where: { platform, enabled: true },
  })
  if (!integration) throw new Error(`Integration not configured for ${platform}`)

  const featureCheck = await checkFeatureAccess(integration.clinicId, "messaging")
  if (!featureCheck.allowed) {
    throw new Error(`Messaging not available: ${featureCheck.reason}`)
  }

  const incoming = await connector.parseIncoming(body, headers, integration.clinicId)
  const result = await processIncomingMessage(integration.clinicId, incoming)

  return { clinicId: integration.clinicId, result }
}

export async function sendReply(
  clinicId: string,
  conversationId: string,
  content: string,
): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clinicId },
  })
  if (!conversation) throw new Error("Conversation not found")

  const outgoing: IncomingMessage = {
    platform: conversation.platform as Platform,
    channelId: conversation.channelId || "",
    sourceMessageId: `manual-${Date.now()}`,
    from: { id: "clinic-staff", name: "Clinic Staff" },
    content,
    timestamp: new Date(),
  }

  await prisma.conversationMessage.create({
    data: {
      conversationId,
      role: "assistant",
      content,
      platform: conversation.platform,
      direction: "outgoing",
      status: "closed",
    },
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "closed", lastMessageAt: new Date(), unreadCount: 0 },
  })

  const connector = getConnector(conversation.platform as Platform)
  if (connector) {
    const credentials = await getCredentials(clinicId, conversation.platform as Platform)
    if (credentials) {
      connector.sendMessage(
        {
          id: "",
          clinicId,
          conversationId,
          platform: conversation.platform as Platform,
          direction: "outgoing",
          role: "assistant",
          content,
          status: "closed",
          createdAt: new Date(),
        } as any,
        credentials,
      ).catch(console.error)
    }
  }
}

async function getCredentials(clinicId: string, platform: string): Promise<Record<string, string> | null> {
  try {
    const integration = await prisma.integration.findUnique({
      where: { clinicId_platform: { clinicId, platform } },
    })
    if (!integration?.enabled || !integration.credentials) return null
    return JSON.parse(integration.credentials)
  } catch {
    return null
  }
}

export async function getIntegrationStatus(clinicId: string, platform: Platform) {
  const integration = await prisma.integration.findUnique({
    where: { clinicId_platform: { clinicId, platform } },
  })
  return {
    platform,
    enabled: integration?.enabled || false,
    status: integration?.status || "disconnected",
    lastSyncAt: integration?.lastSyncAt || null,
    settings: integration?.settings ? JSON.parse(integration.settings) : null,
    connected: integration?.status === "connected" && integration?.enabled === true,
  }
}

export async function getAllIntegrationStatuses(clinicId: string) {
  const integrations = await prisma.integration.findMany({
    where: { clinicId },
  })

  const map = new Map(integrations.map((i) => [i.platform, i]))

  const platforms: Platform[] = ["whatsapp", "instagram", "facebook", "telegram", "email"]

  return platforms.map((platform) => {
    const integration = map.get(platform)
    return {
      platform,
      enabled: integration?.enabled || false,
      status: integration?.status || "disconnected",
      lastSyncAt: integration?.lastSyncAt || null,
      connected: integration?.status === "connected" && integration?.enabled === true,
    }
  })
}
