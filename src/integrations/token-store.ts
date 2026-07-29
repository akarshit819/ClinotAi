import crypto from "crypto"
import { prisma } from "@/lib/db"
import type { StoredCredentials } from "./types"

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 characters")
  }
  return crypto.scryptSync(key, "clinot-integrations-salt", 32)
}

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16

function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")
  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const parts = ciphertext.split(":")
  if (parts.length !== 3) throw new Error("Invalid encrypted format")
  const [ivHex, tagHex, encrypted] = parts
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

export async function storeCredentials(
  clinicId: string,
  platform: string,
  credentials: StoredCredentials,
): Promise<void> {
  const plaintext = JSON.stringify(credentials)
  const encrypted = encrypt(plaintext)
  await prisma.integration.upsert({
    where: { clinicId_platform: { clinicId, platform } },
    update: {
      credentials: encrypted,
      status: "connected",
      lastSyncAt: new Date(),
    },
    create: {
      clinicId,
      platform,
      enabled: true,
      credentials: encrypted,
      status: "connected",
    },
  })
}

export async function getCredentials(
  clinicId: string,
  platform: string,
): Promise<StoredCredentials | null> {
  const integration = await prisma.integration.findUnique({
    where: { clinicId_platform: { clinicId, platform } },
  })
  if (!integration?.credentials) return null
  try {
    const plaintext = decrypt(integration.credentials)
    return JSON.parse(plaintext)
  } catch {
    return null
  }
}

export async function updateCredentials(
  clinicId: string,
  platform: string,
  updates: Partial<StoredCredentials>,
): Promise<void> {
  const existing = await getCredentials(clinicId, platform)
  if (!existing) throw new Error("No existing credentials to update")
  await storeCredentials(clinicId, platform, { ...existing, ...updates })
}

export async function deleteCredentials(
  clinicId: string,
  platform: string,
): Promise<void> {
  await prisma.integration.update({
    where: { clinicId_platform: { clinicId, platform } },
    data: {
      credentials: null,
      status: "disconnected",
      enabled: false,
      webhookSecret: null,
      lastSyncAt: null,
    },
  })
}
