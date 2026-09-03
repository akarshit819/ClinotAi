/**
 * Typed wrappers for WhatsAppPhoneNumber writes.
 *
 * The Prisma schema defines WhatsAppPhoneNumber's unique key as the
 * COMPOUND (clinicId, phoneNumberId), NOT phoneNumberId alone. The
 * generated `WhatsAppPhoneNumberWhereUniqueInput` therefore requires
 * either `{ id }` or `{ clinicId_phoneNumberId: { clinicId, phoneNumberId } }`.
 *
 * Past production incidents have shown that callers accidentally reach
 * for `where: { phoneNumberId }` (which is neither shape) and the bug
 * only surfaces at runtime because `as any` silences the type error.
 * This module exposes the only correct write paths and requires both
 * `clinicId` and `phoneNumberId` as named, non-optional arguments, so
 * the wrong shape is impossible at compile time.
 */
import { prisma } from "@/lib/db"
import type { Prisma, WhatsAppPhoneNumber } from "@prisma/client"

/**
 * Update lastMessageAt for a clinic's WhatsApp phone record.
 *
 * @param clinicId - The clinic the phone belongs to (required; cannot
 *   be inferred from phoneNumberId alone because the same phoneNumberId
 *   may legally appear under multiple clinics in the schema).
 * @param phoneNumberId - The Meta-issued phone number ID.
 * @param lastMessageAt - The new timestamp.
 * @param tx - Optional Prisma transaction client.
 */
export async function updateLastMessageAt(
  clinicId: string,
  phoneNumberId: string,
  lastMessageAt: Date,
  tx?: Prisma.TransactionClient,
): Promise<WhatsAppPhoneNumber> {
  if (!clinicId) {
    throw new Error("updateLastMessageAt: clinicId is required (multi-tenant isolation)")
  }
  if (!phoneNumberId) {
    throw new Error("updateLastMessageAt: phoneNumberId is required")
  }
  const client = (tx ?? prisma) as Prisma.TransactionClient
  return client.whatsAppPhoneNumber.update({
    where: { clinicId_phoneNumberId: { clinicId, phoneNumberId } },
    data: { lastMessageAt },
  })
}
