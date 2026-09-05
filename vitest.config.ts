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
    // Hermetic normal runs: an empty PICO_LLM_API_URL disables the
    // BuildPico primary path so NO test ever calls the real Pico API
    // (a previous run leaked a real request that returned
    // monthlyUsageLimitExceeded). The gated real-provider test
    // (REAL_AI_PROVIDER_TEST=1) reads the credential directly from
    // .env and force-sets it itself.
    env: {
      PICO_LLM_API_URL: "",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
})