import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Per-file isolation + sequential file execution are REQUIRED:
    // several test files mutate process.env (provider selection reads
    // env at call time) and env must never race between concurrently
    // running files. Each file runs alone, in its own environment.
    isolate: true,
    pool: "forks",
    fileParallelism: false,
    // Hermetic normal runs: an empty OPENROUTER_API_KEY makes the
    // single provider path deterministically NOT_CONFIGURED in every
    // test that does not explicitly set it, so no test can ever leak
    // a real OpenRouter request. The gated real-provider test
    // (REAL_AI_PROVIDER_TEST=1) force-restores the credential from
    // .env itself.
    env: {
      OPENROUTER_API_KEY: "",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
})