import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

/* eslint-disable @typescript-eslint/no-var-requires */
// scripts/ is CommonJS and excluded from tsconfig; require it directly.
// start-production.js itself cannot be imported (it runs main() on require),
// which is why the SSL builder lives in scripts/pg-ssl.js.
const { buildPgConnectionString } = require("../scripts/pg-ssl.js")

const TEST_PEM = [
  "-----BEGIN CERTIFICATE-----",
  "TEST FIXTURE - NOT A REAL CERTIFICATE",
  "-----END CERTIFICATE-----",
  "",
].join("\n")

const AIVEN_URL = "postgresql://user:pass@clinot-db-clinot.g.aivencloud.com:5432/defaultdb?sslmode=require"
const PUBLIC_URL = "postgresql://user:pass@db.render.com:5432/clinot?sslmode=require"

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

function sslrootcertOf(url: string): string | null {
  return new URL(url).searchParams.get("sslrootcert")
}

describe("buildPgConnectionString (Aiven CA trust, verification always on)", () => {
  it("returns the original string untouched when PGSSLROOTCERT is unset", () => {
    expect(buildPgConnectionString({ databaseUrl: PUBLIC_URL, env: {} })).toBe(PUBLIC_URL)
  })

  it("returns the original string untouched when PGSSLROOTCERT is blank", () => {
    expect(buildPgConnectionString({ databaseUrl: PUBLIC_URL, env: { PGSSLROOTCERT: "   " } })).toBe(PUBLIC_URL)
  })

  it("appends pg-native sslrootcert (verification retained) when the CA file exists", () => {
    const derived = buildPgConnectionString({ databaseUrl: AIVEN_URL, env: { PGSSLROOTCERT: pemPath } })
    expect(sslrootcertOf(derived)).toBe(pemPath)
    // Original params preserved; nothing insecure injected.
    expect(new URL(derived).searchParams.get("sslmode")).toBe("require")
    expect(derived).not.toContain("no-verify")
    expect(derived).not.toContain("rejectUnauthorized")
    expect(derived).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED")
  })

  it("throws a clear error when PGSSLROOTCERT points to a missing file", () => {
    const missing = path.join(tmpDir, "nope.pem")
    expect(() => buildPgConnectionString({ databaseUrl: AIVEN_URL, env: { PGSSLROOTCERT: missing } })).toThrow(
      /PGSSLROOTCERT/,
    )
  })

  it("throws when the file is not a PEM certificate", () => {
    const bad = path.join(tmpDir, "bad.pem")
    fs.writeFileSync(bad, "definitely not a certificate", "utf8")
    expect(() => buildPgConnectionString({ databaseUrl: AIVEN_URL, env: { PGSSLROOTCERT: bad } })).toThrow(
      /BEGIN CERTIFICATE/,
    )
  })

  it("fails fast with guidance on Aiven + TLS but no CA (instead of cryptic SELF_SIGNED_CERT_IN_CHAIN)", () => {
    expect(() => buildPgConnectionString({ databaseUrl: AIVEN_URL, env: {} })).toThrow(/PGSSLROOTCERT/)
  })

  it("does not throw for Aiven with explicit sslmode=disable (operator opted out of TLS)", () => {
    const url = "postgresql://user:pass@x.aivencloud.com:5432/db?sslmode=disable"
    expect(buildPgConnectionString({ databaseUrl: url, env: {} })).toBe(url)
  })

  it("does not throw for publicly-trusted providers without a CA (behavior preserved)", () => {
    expect(buildPgConnectionString({ databaseUrl: PUBLIC_URL, env: {} })).toBe(PUBLIC_URL)
    const plain = "postgresql://user:pass@localhost:5432/dev"
    expect(buildPgConnectionString({ databaseUrl: plain, env: {} })).toBe(plain)
  })
})
