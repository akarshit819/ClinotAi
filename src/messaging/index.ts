import { registerConnector } from "./connectors/registry"
import { WebsiteConnector } from "./connectors/website/connector"
import { WhatsAppConnector } from "./connectors/whatsapp/connector"

registerConnector(new WebsiteConnector())
registerConnector(new WhatsAppConnector())

export { processIncomingMessage } from "./pipeline"
export { getConnector, getAllConnectors, registerConnector } from "./connectors/registry"
export { WebsiteConnector } from "./connectors/website/connector"
export { WhatsAppConnector } from "./connectors/whatsapp/connector"

export {
  ingestMessage,
  handlePlatformWebhook,
  sendReply,
  getIntegrationStatus,
  getAllIntegrationStatuses,
} from "./engine"

export {
  getConversations,
  getConversationDetail,
  markConversationRead,
  updateConversationStatus,
  getUnreadCount,
} from "./inbox/service"

export type {
  IncomingMessage,
  ProcessedMessage,
  ConversationSummary,
  PipelineContext,
  Platform,
  PlatformConfig,
  Intent,
  MessageStatus,
  ConversationStatus,
  MessageDirection,
  Attachment,
  PlatformUser,
} from "./types"

export { PLATFORM_CONFIGS, ALL_PLATFORMS, CONNECTABLE_PLATFORMS } from "./types"
