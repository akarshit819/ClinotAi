/**
 * Static + runtime guards for the AI tools module.
 *
 * PRODUCTION INCIDENT: src/lib/ai/tools.ts used dynamic
 * `import("../appointment/tools")` / `import("@/lib/appointment/tools")`.
 * In the production launcher's in-process worker (tsx), a dynamic
 * import() can escape to Node's native ESM resolver, which cannot
 * resolve extensionless relative paths or the "@" tsconfig alias —
 * every WhatsApp message failed with:
 *
 *   Cannot find module '.../src/lib/appointment/tools'
 *   imported from '.../src/lib/ai/tools.ts'
 *
 * before any AI provider was contacted (aiCallAttempted=false,
 * AI_INTERNAL_ERROR).
 *
 * These guards ensure:
 *   1. (static) tools.ts contains NO dynamic import() of local modules
 *      — all local dependencies must be statically imported so they
 *      resolve under whichever loader loaded tools.ts itself.
 *   2. (runtime) buildToolDefinitions() + executeToolCall() actually
 *      work through a plain (unmocked) load of the module.
 */
import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const TOOLS_FILE = path.join(ROOT, "src", "lib", "ai", "tools.ts")

describe("AI tools module: production runtime safety", () => {
  it("STATIC GUARD: tools.ts contains no dynamic import() of local modules", () => {
    const src = fs.readFileSync(TOOLS_FILE, "utf8")
    // Match dynamic import() whose argument is a relative path or the
    // "@" alias — i.e. any local TS module. Package imports ("openai")
    // resolve fine under native ESM and are allowed.
    const dynamicLocalImport = /import\(\s*["'](\.\.?\/|@\/)["']/g
    const offenders: string[] = []
    let m: RegExpExecArray | null
    while ((m = dynamicLocalImport.exec(src)) !== null) {
      offenders.push(m[0])
    }
    expect(offenders, `Dynamic local imports in tools.ts: ${offenders.join(", ")}. Use static imports — dynamic import() escapes to native ESM resolution in the production tsx worker and fails with ERR_MODULE_NOT_FOUND.`).toEqual([])
  })

  // Generous timeout: the plain load transitively initializes the
  // Prisma client, which is slow on a cold worker.
  it("RUNTIME: buildToolDefinitions() returns all appointment tools through a plain module load", { timeout: 120_000 }, async () => {
    // Unmocked load of the exact module that failed in production.
    const mod = await import("../src/lib/ai/tools")
    expect(typeof mod.buildToolDefinitions).toBe("function")
    expect(typeof mod.executeToolCall).toBe("function")
    const defs = mod.buildToolDefinitions()
    expect(defs.length).toBeGreaterThanOrEqual(5)
    const names = defs.map((d: { function: { name: string } }) => d.function.name)
    expect(names).toContain("find_available_slots")
    expect(names).toContain("book_appointment")
    // Every definition has the chat-completions tool shape.
    for (const d of defs) {
      expect(d.type).toBe("function")
      expect(d.function.name).toBeTruthy()
      expect(d.function.description).toBeTruthy()
      expect(d.function.parameters).toBeTruthy()
    }
  })

  it("RUNTIME: executeToolCall() handles an unknown tool without touching the database", { timeout: 120_000 }, async () => {
    const mod = await import("../src/lib/ai/tools")
    const result = await mod.executeToolCall(
      { name: "totally_unknown_tool", arguments: "{}" },
      "clinic-guard",
    )
    expect(result.error).toContain("Unknown tool")
    expect(result.result).toBeNull()
  })
})
