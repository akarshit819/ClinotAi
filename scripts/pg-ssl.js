/**
 * PostgreSQL TLS configuration for raw `pg` clients.
 *
 * Background: managed providers such as Aiven sign their server certificates
 * with a private CA that is NOT in the OS trust store. A `pg` Client whose
 * connection string carries `?sslmode=require` then fails at connect time with:
 *
 *   SELF_SIGNED_CERT_IN_CHAIN
 *
 * Two pg-driver facts (verified against the installed pg 8.x sources in
 * node_modules — do not rely on memory here) dictate the implementation:
 *
 * 1. `new Client({ connectionString, ssl })`: the parsed connection string
 *    OVERWRITES explicit top-level keys
 *    (`Object.assign({}, config, parse(connectionString))` in
 *    pg/lib/connection-parameters.js). Passing `ssl: { ca }` next to a URL
 *    that already carries SSL params therefore does NOTHING — the parsed
 *    `ssl: {}` wins. The CA must travel through pg's native `sslrootcert`
 *    URL parameter instead.
 * 2. pg has no native `PGSSLROOTCERT` support (`readSSLConfigFromEnvironment`
 *    only honors `PGSSLMODE`, never a CA path), so this module bridges the
 *    standard libpq variable to pg's `sslrootcert` parameter.
 *
 * The secure fix this module implements: when `PGSSLROOTCERT` points at a
 * valid CA PEM (e.g. a Render Secret File mount), return a pg-only copy of
 * the connection string with `sslrootcert` appended. pg then reads the file
 * into `ssl.ca` with full certificate + hostname verification retained.
 *
 * Security guarantees (do not weaken):
 * - Verification is NEVER disabled. This module never emits
 *   `rejectUnauthorized: false`, `sslmode=no-verify`, `NODE_TLS_REJECT_UNAUTHORIZED=0`,
 *   or any equivalent, and offers no env knob to do so.
 * - A configured-but-unreadable CA fails fast with a clear error instead of
 *   silently falling back to the broken default.
 * - A known private-CA host (Aiven) with TLS requested but no CA configured
 *   fails fast with an actionable error instead of the cryptic
 *   SELF_SIGNED_CERT_IN_CHAIN.
 * - When `PGSSLROOTCERT` is unset (and the host is not a known private-CA
 *   host), the ORIGINAL string is returned byte-identical, preserving
 *   existing behavior for providers whose chains are publicly trusted.
 * - `DATABASE_URL` itself is never mutated; only the string handed to the
 *   raw `pg` client is derived. Prisma keeps using the original URL.
 *
 * Kept as a separate dependency-free CommonJS module (instead of inline in
 * start-production.js) so it can be unit-tested: the launcher executes
 * main() on require and therefore cannot be imported by tests.
 */

/* eslint-disable no-unused-vars */

const fs = require("fs")

function getParam(url, name) {
  try {
    const value = new URL(url).searchParams.get(name)
    return (value || "").trim().toLowerCase()
  } catch {
    return ""
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.trim().toLowerCase()
  } catch {
    return ""
  }
}

function isAivenHost(hostname) {
  return hostname === "aivencloud.com" || hostname.endsWith(".aivencloud.com")
}

/** True when pg will negotiate TLS for this URL (any verification level). */
function willNegotiateTls(url) {
  if (getParam(url, "sslnegotiation") === "direct") return true
  if (getParam(url, "sslcert") || getParam(url, "sslkey") || getParam(url, "sslrootcert")) return true
  const mode = getParam(url, "sslmode")
  return mode !== "" && mode !== "disable"
}

function readCaFile(caPath) {
  let stat = null
  try {
    stat = fs.statSync(caPath)
  } catch {
    stat = null
  }
  if (!stat || !stat.isFile()) {
    throw new Error(
      `PGSSLROOTCERT is set to "${caPath}" but that file does not exist or is not a file. ` +
        `Mount the provider CA certificate there (Render: Secret File named ca.pem) or unset PGSSLROOTCERT. ` +
        `Refusing to connect without the configured CA rather than failing later with SELF_SIGNED_CERT_IN_CHAIN.`,
    )
  }
  const ca = fs.readFileSync(caPath, "utf8")
  if (!ca.includes("BEGIN CERTIFICATE")) {
    throw new Error(
      `PGSSLROOTCERT file "${caPath}" does not look like a PEM certificate (no BEGIN CERTIFICATE block). ` +
        `Provide the provider CA PEM (e.g. the Aiven ca.pem download).`,
    )
  }
  return caPath
}

/**
 * @param {{ databaseUrl?: string, env?: NodeJS.ProcessEnv }} args
 * @returns {string} connection string to hand to `new pg.Client({ connectionString })`
 * @throws when a CA is configured-but-unusable, or when talking TLS to a
 *   known private-CA host (Aiven) with no CA configured.
 */
function buildPgConnectionString({ databaseUrl = "", env = process.env } = {}) {
  const caPath = ((env || {}).PGSSLROOTCERT || "").trim()
  const hostname = getHostname(databaseUrl)

  if (caPath) {
    // Validate now so a bad mount fails fast with guidance (pg would
    // otherwise throw a bare ENOENT during Client construction).
    readCaFile(caPath)
    const derived = new URL(databaseUrl)
    derived.searchParams.set("sslrootcert", caPath)
    return derived.toString()
  }

  if (hostname && isAivenHost(hostname) && willNegotiateTls(databaseUrl)) {
    throw new Error(
      `Aiven PostgreSQL host detected (host=${hostname}) but PGSSLROOTCERT is not set, ` +
        `so certificate verification cannot succeed (expect SELF_SIGNED_CERT_IN_CHAIN). ` +
        `Mount the Aiven ca.pem as a Render Secret File and set PGSSLROOTCERT=/etc/secrets/ca.pem, ` +
        `then redeploy. Verification stays enabled; there is no insecure fallback.`,
    )
  }

  return databaseUrl
}

module.exports = { buildPgConnectionString }
