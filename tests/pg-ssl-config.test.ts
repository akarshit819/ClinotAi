import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

/* eslint-disable @typescript-eslint/no-var-requires */
// scripts/ is CommonJS and excluded from tsconfig; require it directly.
// start-production.js itself cannot be imported (it runs main() on require),
// which is why the SSL builder lives in scripts/pg-ssl.js.
const { buildPgSslConfig } = require("../scripts/pg-ssl.js")

const TEST_PEM = [
  "-----BEGIN CERTIFICATE-----",
  "TEST FIXTURE - NOT A REAL CERTIFICATE",
  "-----END CERTIFICATE-----",
  "",
].join("\n")

const BASE_URL = "postgresql://user:pass@clinot-db-clinot.g.aivencloud.com:5432/defaultdb?sslmode=require"

let tmpDir = ""
let pemPath = ""

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clinot-pg-ssl-"))
  pemPath = path.join(tmpDir, "ca.pem")
  fs.writeFileSync(pemPath, TEST_PEM, "utf8")
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("buildPgSslConfig (Aiven CA trust, verification always on)", () => {
  it("returns undefined when PGSSLROOTCERT is unset (pg defaults preserved)", () => {
    expect(buildPgSslConfig({ databaseUrl: BASE_URL, env: {} })).toBeUndefined()
  })

  it("returns undefined when PGSSLROOTCERT is empty/blank", () => {
    expect(buildPgSslConfig({ databaseUrl: BASE_URL, env: { PGSSLROOTCERT: "   " } })).toBeUndefined()
  })

  it("returns the CA with verification retained when the file exists", () => {
    const ssl = buildPgSslConfig({ databaseUrl: BASE_URL, env: { PGSSLROOTCERT: pemPath } })
    expect(ssl).toBeDefined()
    expect(ssl!.ca).toBe(TEST_PEM)
    expect(ssl!.rejectUnauthorized).toBe(true)
  })

  it("throws a clear error when PGSSLROOTCERT points to a missing file", () => {
    const missing = path.join(tmpDir, "nope.pem")
    expect(() => buildPgSslConfig({ databaseUrl: BASE_URL, env: { PGSSLROOTCERT: missing } })).toThrow(
      /PGSSLROOTCERT/,
    )
  })

  it("throws when the file is not a PEM certificate", () => {
    const bad = path.join(tmpDir, "bad.pem")
    fs.writeFileSync(bad, "definitely not a certificate", "utf8")
    expect(() => buildPgSslConfig({ databaseUrl: BASE_URL, env: { PGSSLROOTCERT: bad } })).toThrow(
      /BEGIN CERTIFICATE/,
    )
  })

  it("respects explicit sslmode=disable without forcing TLS on", () => {
    const url = "postgresql://user:pass@host:5432/db?sslmode=disable"
    expect(buildPgSslConfig({ databaseUrl: url, env: { PGSSLROOTCERT: pemPath } })).toBeUndefined()
  })

  it("never produces a verification-disabled config", () => {
    // Every defined output must keep rejectUnauthorized: true. There is
    // intentionally no input that yields rejectUnauthorized: false.
    const ssl = buildPgSslConfig({ databaseUrl: BASE_URL, env: { PGSSLROOTCERT: pemPath } }) as any
    expect(ssl.rejectUnauthorized).not.toBe(false)
    expect(ssl).not.toHaveProperty("checkServerIdentity")
  })
})
