import type { PlatformConnector } from "./base"
import type { Platform } from "../types"

const connectors = new Map<Platform, PlatformConnector>()

export function registerConnector(connector: PlatformConnector): void {
  connectors.set(connector.platform, connector)
}

export function getConnector(platform: Platform): PlatformConnector | undefined {
  return connectors.get(platform)
}

export function getAllConnectors(): PlatformConnector[] {
  return Array.from(connectors.values())
}

export function getConnectedPlatforms(): Platform[] {
  return Array.from(connectors.keys())
}
