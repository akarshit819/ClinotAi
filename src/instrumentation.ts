import { validateProductionSecrets } from "./lib/env"

export async function register(): Promise<void> {
  validateProductionSecrets()
}