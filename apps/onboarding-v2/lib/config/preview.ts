import type { AppConfig } from "./env";

export function allowsUiPreview(config: Pick<AppConfig, "appEnv" | "providerMode">): boolean {
  return config.appEnv !== "production" && config.providerMode === "mock";
}
