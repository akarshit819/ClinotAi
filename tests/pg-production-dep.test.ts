/**
 * Regression guard: `pg` MUST be declared in package.json dependencies.
 *
 * scripts/start-production.js's verifySchemaReadiness() does a raw
 * `require("pg")` after `prisma migrate deploy` to confirm the critical
 * tables exist. If `pg` is not installed in the production dependency
 * tree (which happens when `npm ci` runs against a lockfile that does
 * not include `pg`), production startup fails with:
 *
 *   FATAL: 'pg' module is not installed
 *   Cannot find module 'pg'
 *   Require stack: - /opt/render/project/src/scripts/start-production.js
 *
 * This test reads package.json and package-lock.json at the repo root
 * and asserts that `pg` is declared in dependencies (not devDependencies)
 * and that the lockfile's root package entry references the same
 * version. If a future change moves `pg` to devDependencies or removes
 * it entirely, this test fails before the change can be merged.
 */
import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const PACKAGE_JSON = path.join(ROOT, "package.json")
const LOCKFILE = path.join(ROOT, "package-lock.json")

describe("Production dependency guard: 'pg' is a runtime dependency", () => {
  it("package.json declares 'pg' in dependencies (not devDependencies)", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"))
    const deps = pkg.dependencies || {}
    const devDeps = pkg.devDependencies || {}
    expect(deps.pg, "pg must be in dependencies").toBeTruthy()
    expect(devDeps.pg, "pg must NOT be in devDependencies").toBeUndefined()
  })

  it("package-lock.json root entry includes 'pg' with the same version", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"))
    const lock = JSON.parse(fs.readFileSync(LOCKFILE, "utf8"))
    const root = lock.packages?.[""] || lock.packages?.["."]
    expect(root, "package-lock.json must have a root packages entry").toBeTruthy()
    const lockPg = root.dependencies?.pg || root.devDependencies?.pg
    expect(lockPg, "lockfile root must reference pg").toBeTruthy()
    // npm stores version as a range like "^8.23.0" or "8.23.0".
    const declared = depsVersionRange(pkg.dependencies.pg)
    expect(lockPg).toContain(declared)
  })

  it("scripts/start-production.js's verifySchemaReadiness requires pg", () => {
    // The launcher uses pg.Client directly. If someone refactors the
    // schema check away, this test will fail and force them to update
    // this guard — the production runtime contract is "pg is a
    // required runtime dep because the launcher does a raw SQL check
    // after migrations".
    const launcher = fs.readFileSync(
      path.join(ROOT, "scripts", "start-production.js"),
      "utf8",
    )
    expect(launcher).toMatch(/require\(["']pg["']\)/)
    expect(launcher).toMatch(/verifySchemaReadiness/)
  })
})

function depsVersionRange(raw: string): string {
  // Strip semver range syntax for substring comparison.
  // e.g. "^8.23.0" -> "8.23.0", "~8.23.0" -> "8.23.0", "8.23.0" -> "8.23.0".
  return raw.replace(/^[\^~]/, "")
}
