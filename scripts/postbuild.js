#!/usr/bin/env node

/**
 * Post-build step for the `output: "standalone"` Next.js configuration.
 *
 * The standalone server (.next/standalone/server.js) is self-contained but
 * does NOT include `public/` or `.next/static/` — both must be copied into
 * the standalone folder after every build, otherwise the server boots with
 * broken CSS/JS assets and missing static files.
 *
 * Cross-platform (no shell `cp`): runs on Windows dev machines and Linux CI.
 */

const fs = require("fs")
const path = require("path")

const rootDir = path.resolve(__dirname, "..")
const standaloneDir = path.join(rootDir, ".next", "standalone")

if (!fs.existsSync(standaloneDir)) {
  console.log("[postbuild] No standalone output found — nothing to copy.")
  process.exit(0)
}

const copies = [
  { from: path.join(rootDir, "public"), to: path.join(standaloneDir, "public") },
  { from: path.join(rootDir, ".next", "static"), to: path.join(standaloneDir, ".next", "static") },
]

for (const { from, to } of copies) {
  if (!fs.existsSync(from)) {
    console.warn(`[postbuild] Missing source: ${path.relative(rootDir, from)} — skipping.`)
    continue
  }
  fs.cpSync(from, to, { recursive: true })
  console.log(`[postbuild] Copied ${path.relative(rootDir, from)} -> ${path.relative(rootDir, to)}`)
}

console.log("[postbuild] Standalone output ready: node .next/standalone/server.js")
