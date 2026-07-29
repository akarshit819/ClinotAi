import type { SendMessageResult } from "./types"

export interface SmtpConfig {
  host: string
  port: number
  username: string
  password: string
  secure: boolean
  fromEmail: string
  fromName: string
}

export interface GmailConfig {
  accessToken: string
  refreshToken?: string
  email: string
  name: string
}

export interface OutlookConfig {
  accessToken: string
  refreshToken?: string
  email: string
  name: string
}

export type EmailConfig =
  | { type: "smtp"; config: SmtpConfig }
  | { type: "gmail"; config: GmailConfig }
  | { type: "outlook"; config: OutlookConfig }

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1"
const OUTLOOK_API = "https://graph.microsoft.com/v1.0"

function makeEmailBody(
  to: string,
  subject: string,
  text: string,
  fromEmail: string,
  fromName: string,
): string {
  const headers = [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ]
  return headers.join("\r\n")
}

export async function sendEmailViaGmail(
  config: GmailConfig,
  to: string,
  subject: string,
  text: string,
): Promise<SendMessageResult> {
  try {
    const raw = makeEmailBody(to, subject, text, config.email, config.name)
    const base64Url = Buffer.from(raw)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")

    const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url }),
    })

    const data = await res.json()

    if (!res.ok) {
      return { success: false, error: data.error?.message || `Gmail API error: ${res.status}` }
    }

    return { success: true, messageId: data.id }
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" }
  }
}

export async function sendEmailViaOutlook(
  config: OutlookConfig,
  to: string,
  subject: string,
  text: string,
): Promise<SendMessageResult> {
  try {
    const res = await fetch(`${OUTLOOK_API}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: text },
          toRecipients: [
            {
              emailAddress: { address: to },
            },
          ],
        },
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      return { success: false, error: data.error?.message || `Outlook API error: ${res.status}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" }
  }
}

export async function sendEmailViaSmtp(
  config: SmtpConfig,
  to: string,
  subject: string,
  text: string,
): Promise<SendMessageResult> {
  try {
    const { createTransport } = await import("nodemailer")
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
    })

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      text,
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "SMTP error" }
  }
}

export async function sendEmail(
  emailConfig: EmailConfig,
  to: string,
  subject: string,
  text: string,
): Promise<SendMessageResult> {
  switch (emailConfig.type) {
    case "gmail":
      return sendEmailViaGmail(emailConfig.config, to, subject, text)
    case "outlook":
      return sendEmailViaOutlook(emailConfig.config, to, subject, text)
    case "smtp":
      return sendEmailViaSmtp(emailConfig.config, to, subject, text)
  }
}

export async function listGmailMessages(
  config: GmailConfig,
  maxResults: number = 20,
): Promise<Array<{ id: string; threadId: string; snippet: string; from: string; subject: string; date: string }>> {
  try {
    const res = await fetch(
      `${GMAIL_API}/users/me/messages?maxResults=${maxResults}&q=in:inbox`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
    )
    const data = await res.json()
    if (!res.ok) return []

    const messages = []
    for (const msg of data.messages || []) {
      const detail = await fetch(
        `${GMAIL_API}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${config.accessToken}` } },
      )
      const detailData = await detail.json()
      const headers = detailData.payload?.headers || []
      messages.push({
        id: detailData.id,
        threadId: detailData.threadId,
        snippet: detailData.snippet || "",
        from: headers.find((h: any) => h.name === "From")?.value || "",
        subject: headers.find((h: any) => h.name === "Subject")?.value || "",
        date: headers.find((h: any) => h.name === "Date")?.value || "",
      })
    }
    return messages
  } catch {
    return []
  }
}

export async function checkEmailConfig(
  emailConfig: EmailConfig,
): Promise<{ valid: boolean; email?: string; name?: string; error?: string }> {
  try {
    switch (emailConfig.type) {
      case "gmail": {
        const res = await fetch(`${GMAIL_API}/users/me/profile`, {
          headers: { Authorization: `Bearer ${emailConfig.config.accessToken}` },
        })
        if (!res.ok) return { valid: false, error: "Gmail access revoked" }
        const data = await res.json()
        return { valid: true, email: data.emailAddress, name: emailConfig.config.name }
      }
      case "outlook": {
        const res = await fetch(`${OUTLOOK_API}/me`, {
          headers: { Authorization: `Bearer ${emailConfig.config.accessToken}` },
        })
        if (!res.ok) return { valid: false, error: "Outlook access revoked" }
        const data = await res.json()
        return { valid: true, email: data.mail || data.userPrincipalName, name: data.displayName }
      }
      case "smtp": {
        const { createTransport } = await import("nodemailer")
        const transporter = createTransport({
          host: emailConfig.config.host,
          port: emailConfig.config.port,
          secure: emailConfig.config.secure,
          auth: { user: emailConfig.config.username, pass: emailConfig.config.password },
        })
        await transporter.verify()
        return { valid: true, email: emailConfig.config.fromEmail, name: emailConfig.config.fromName }
      }
    }
  } catch (err: any) {
    return { valid: false, error: err.message || "Validation failed" }
  }
}
