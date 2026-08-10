import fs from "fs"
import { prisma } from "./lib/db"
import { getCredentials } from "./integrations/token-store"

async function main() {
  const clinicId = process.argv[2]
  if (!clinicId) {
    console.error("usage: tsx src/_get-creds.ts <clinicId>")
    process.exit(1)
  }
  const creds = await getCredentials(clinicId, "whatsapp")
  if (!creds) {
    console.error("NO CREDENTIALS")
    process.exit(1)
  }
  const meta = (creds.metadata || {}) as any
  const payload = {
    accessToken: creds.accessToken,
    phoneNumberId: meta.phoneNumberId || "",
    wabaId: meta.wabaId || "",
    businessId: meta.businessId || "",
    displayPhoneNumber: meta.displayPhoneNumber || "",
  }
  if (!payload.accessToken || !payload.phoneNumberId || !payload.wabaId) {
    console.error("INCOMPLETE CREDENTIALS")
    process.exit(1)
  }
  fs.writeFileSync("C:/Users/Dell/AppData/Local/Temp/opencode/wa-creds.json", JSON.stringify(payload, null, 2))
  console.log("saved to temp file")
  console.log("phoneNumberId:", payload.phoneNumberId)
  console.log("wabaId:", payload.wabaId)
  console.log("displayPhoneNumber:", payload.displayPhoneNumber)
  console.log("businessId:", payload.businessId)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("FAILED:", e.message || e)
  process.exitCode = 1
})
