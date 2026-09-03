/**
 * Source-level static guards against the WhatsAppPhoneNumber update
 * regression. Runs in the normal `npm test` suite (no gating).
 *
 * This test FAILS THE BUILD if any non-test source file:
 *   - calls prisma.whatsAppPhoneNumber.update directly, OR
 *   - uses `as any` to silence the unique-key type error.
 *
 * The fix routes all writes through
 * `@/integrations/whatsapp-phone-repo/updateLastMessageAt` which
 * requires clinicId as a non-optional parameter at the call site.
 */
import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const ROOT = path.join(process.cwd(), "src")

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

describe("Static guards: WhatsAppPhoneNumber writes go through the typed wrapper", () => {
  const files = walk(ROOT)

  it("no source file calls prisma.whatsAppPhoneNumber.update directly", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = []
    for (const f of files) {
      // The wrapper itself is the ONLY allowed file.
      if (f.endsWith("whatsapp-phone-repo.ts")) continue
      const lines = fs.readFileSync(f, "utf8").split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (/prisma\.whatsAppPhoneNumber\.update\s*\(/.test(lines[i])) {
          offenders.push({ file: f, line: i + 1, text: lines[i].trim() })
        }
      }
    }
    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  ${path.relative(ROOT, o.file)}:${o.line}  ${o.text}`)
        .join("\n")
      throw new Error(
        `Direct prisma.whatsAppPhoneNumber.update() calls found outside the wrapper.\n` +
        `All writes MUST go through @/integrations/whatsapp-phone-repo so that\n` +
        `clinicId is a required parameter at the call site.\nOffenders:\n${msg}`,
      )
    }
    expect(offenders).toEqual([])
  })

  it("no source file uses 'as any' to silence the WhatsAppPhoneNumber where-clause type error", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = []
    for (const f of files) {
      const lines = fs.readFileSync(f, "utf8").split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Look for: ... phoneNumberId ... as any
        if (/phoneNumberId/i.test(line) && /\bas\s+any\b/.test(line)) {
          offenders.push({ file: f, line: i + 1, text: line.trim() })
        }
      }
    }
    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  ${path.relative(ROOT, o.file)}:${o.line}  ${o.text}`)
        .join("\n")
      throw new Error(`Suspicious 'as any' near phoneNumberId found:\n${msg}`)
    }
    expect(offenders).toEqual([])
  })
})
