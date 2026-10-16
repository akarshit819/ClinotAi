/**
 * PostgreSQL TLS configuration for raw `pg` clients.
 *
 * Background: managed providers such as Aiven sign their server certificates
 * with a private CA that is NOT in the OS trust store. A `pg` Client created
 * with no `ssl` options (or with `?sslmode=require`, which pg maps to TLS
 * with default verification) then fails at connect time with:
 *
 *   SELF_SIGNED_CERT_IN_CHAIN
 *
 * The secure fix is to hand `pg` the provider CA while KEEPING full
 * certificate + hostname verification. This module builds exactly that
 * config from the standard libpq `PGSSLROOTCERT` variable (a filesystem
 * path to the CA PEM, e.g. a Render Secret File mount):
 *
 *   PGSSLROOTCERT=/etc/secrets/ca.pem
 *
 * Security guarantees (do not weaken):
 * - Verification is NEVER disabled. This module has no code path that
 *   produces `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`,
 *   or any equivalent. There is intentionally no env knob to turn
 *   verification off.
 * - `rejectUnauthorized: true` is always set, so Node still verifies the
 *   hostname against the server certificate (pg's default
 *   `checkServerIdentity`).
 * - A configured-but-unreadable CA fails fast with a clear error instead of
 *   silently falling back to the broken default.
 * - When `PGSSLROOTCERT` is unset, this returns `undefined` and the caller
 *   must leave `pg`'s defaults untouched, preserving existing behavior for
 *   providers whose chains are publicly trusted (e.g. Render/Railway
 *   Postgres).
 *
 * Kept as a separate dependency-free CommonJS module (instead of inline in
 * start-production.js) so it can be unit-tested: the launcher executes
 * main() on require and therefore cannot be imported by tests.
 */

const fs = require("fs")

/**
 * @param {{ databaseUrl?: string, env?: NodeJS.ProcessEnv }} args
 * @returns {undefined | { ca: string, rejectUnauthorized: true }}
 * @throws when PGSSLROOTCERT is set but unusable.
 */
function buildPgSslConfig({ databaseUrl = "", env = process.env } = {}) {
  const caPath = (env.PGSSLROOTCERT || "").trim()
  if (!caPath) return undefined

  // An explicit `sslmode=disable` in DATABASE_URL means the operator opted
  // out of TLS at the connection-string level. Respect it (do not force
  // TLS on); pg handles the rest. Verification policy is unchanged because
  // no TLS is negotiated at all in that case.
  let sslMode = ""
  try {
    const query = new URL(databaseUrl).searchParams.get("sslmode") || ""
    sslMode = query.trim().toLowerCase()
  } catch {
    // Unparseable URL: let pg surface that error itself; only the CA path
    // matters here, and it is validated below.
  }
  if (sslMode === "disable") return undefined

  let stat = null
  try {
    stat = fs.statSync(caPath)
  } catch {
    stat = null
  }
  if (!stat || !stat.isFile()) {
    throw new Error(
      `PGSSLROOTCERT is set to "${caPath}" but that file does not exist or is not a file. ` +
        `Mount the provider CA certificate there (Render: Secret File) or unset PGSSLROOTCERT. ` +
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

  return { ca, rejectUnauthorized: true }
}

module.exports = { buildPgSslConfig }
