export const GRAPH_API = process.env.META_GRAPH_API || "https://graph.facebook.com/v20.0"
export const API_VERSION = "v20.0"

export interface WhatsAppConfig {
  accessToken: string
  phoneNumberId: string
  wabaId: string
  businessId: string
}

export type WhatsAppMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "document"
  | "contacts"
  | "location"
  | "interactive"
  | "template"
  | "sticker"
  | "reaction"
  | "button"
  | "order"
  | "system"
  | "unknown"

export interface WhatsAppText {
  body: string
  preview_url?: boolean
}

export interface WhatsAppMedia {
  id?: string
  link?: string
  caption?: string
  filename?: string
  provider?: string
  mime_type?: string
  sha256?: string
}

export interface WhatsAppLocation {
  longitude: number
  latitude: number
  name?: string
  address?: string
}

export interface WhatsAppContactName {
  formatted_name: string
  first_name?: string
  last_name?: string
  middle_name?: string
  suffix?: string
  prefix?: string
}

export interface WhatsAppContactPhone {
  phone: string
  type?: "HOME" | "WORK" | "CELL" | "MAIN" | "OTHER"
}

export interface WhatsAppContact {
  name: WhatsAppContactName
  phones?: WhatsAppContactPhone[]
  emails?: { email: string; type?: "HOME" | "WORK" }[]
  org?: { company?: string; department?: string; title?: string }
  urls?: { url: string; type?: "HOME" | "WORK" }[]
}

export interface WhatsAppInteractiveAction {
  button?: string
  buttons?: { type: "reply"; reply: { id: string; title: string } }[]
  sections?: { title?: string; rows: { id: string; title: string; description?: string }[] }[]
  name?: "address_message" | "review_and_pay" | "shop" | "payment"
  parameters?: Record<string, any>
}

export interface WhatsAppInteractive {
  type: "button" | "list" | "flow" | "catalog_message" | "product" | "product_list"
  header?: { type: "text" | "image" | "video" | "document"; text?: string; image?: WhatsAppMedia; video?: WhatsAppMedia; document?: WhatsAppMedia }
  body?: { text: string }
  footer?: { text: string }
  action: WhatsAppInteractiveAction
}

export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "footer" | "button"
  parameters: { type: "text" | "currency" | "date_time" | "image" | "document" | "video"; text?: string; currency?: any; date_time?: any; image?: WhatsAppMedia; document?: WhatsAppMedia; video?: WhatsAppMedia }[]
  index?: number
  sub_type?: "quick_reply" | "url" | "catalog" | "mpm" | "cta_url" | "cta_call" | "copy_code"
}

export interface WhatsAppTemplate {
  name: string
  language: { code: string; policy?: "deterministic" | "fallback" }
  components?: WhatsAppTemplateComponent[]
  namespace?: string
}

export interface WhatsAppSendMessageRequest {
  messaging_product: "whatsapp"
  recipient_type: "individual"
  to: string
  type: WhatsAppMessageType
  text?: WhatsAppText
  image?: WhatsAppMedia
  video?: WhatsAppMedia
  audio?: WhatsAppMedia
  document?: WhatsAppMedia
  sticker?: WhatsAppMedia
  location?: WhatsAppLocation
  contacts?: WhatsAppContact[]
  interactive?: WhatsAppInteractive
  template?: WhatsAppTemplate
  preview_url?: boolean
  context?: { message_id: string }
  biz_opaque_callback_data?: string
}

export interface WhatsAppIncomingMessage {
  from: string
  id: string
  timestamp: string
  type: WhatsAppMessageType
  text?: { body: string }
  image?: WhatsAppMedia
  video?: WhatsAppMedia
  audio?: WhatsAppMedia
  voice?: WhatsAppMedia
  document?: WhatsAppMedia
  sticker?: WhatsAppMedia
  location?: WhatsAppLocation
  contacts?: WhatsAppContact[]
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
  button?: { payload: string; text: string }
  order?: any
  system?: any
  reaction?: { message_id: string; emoji: string }
  context?: { message_id: string; from?: string; referred_product?: any }
}

export interface WhatsAppStatus {
  id: string
  status: string
  timestamp: string
  recipient_id: string
  conversation?: { id: string; expiration_timestamp?: string }
  pricing?: { billable: boolean; pricing_model: string; category: string }
}

export interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account"
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: "whatsapp"
        metadata: { phone_number_id: string; display_phone_number: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: WhatsAppIncomingMessage[]
        statuses?: WhatsAppStatus[]
        errors?: Array<{ code: number; title: string; message: string; error_data?: { details: string } }>
      }
      field: "messages"
    }>
  }>
}

export interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
  statusCode?: number
}

export interface MediaUploadResult {
  success: boolean
  mediaId?: string
  url?: string
  error?: string
}

export interface BusinessProfile {
  about: string
  description: string
  email?: string
  websites?: string[]
  address?: string
  vertical?: string
}

export interface PhoneNumberInfo {
  id: string
  displayPhoneNumber: string
  verifiedName: string
  qualityRating: string
  codeVerificationStatus?: string
  status?: string
}

export interface WABAInfo {
  id: string
  name?: string
  currency?: string
  timezoneId?: string
  messageTemplateNamespace?: string
  businessId?: string
}

export interface WebhookEventRecord {
  eventId: string
  clinicId: string
  phoneNumberId?: string
  type: string
  status: string
  createdAt: Date
}

export type MessageStatus =
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "pending"
  | "rejected"
  | "deleted"
