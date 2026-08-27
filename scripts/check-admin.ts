import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "admin@clinot.ai" } })
  console.log("Admin user:", user ? "EXISTS" : "NOT FOUND")
  if (user) console.log("User:", JSON.stringify({ id: user.id, email: user.email, name: user.name, roleId: user.roleId }, null, 2))
  await prisma.$disconnect()
}

main().catch(console.error)