import type { ModelOption } from "@/core/modelOptions";
import type { Message } from "@/core";
import { getDefaultModelForProvider, getModelOptionsForProvider } from "@/services/server/modelsApi";
import { ColorMode, ColorModePreference } from "@/theme";

export type ModalSessionItem = {
  id: string;
  provider?: string | null;
  model?: string | null;
  running?: boolean;
  sseConnected?: boolean;
  messages?: Message[];
  cwd?: string | null;
};

export const EMPTY_SESSION_CLEANUP_MS = 3 * 60 * 1000;
export const SESSION_CLEANUP_INTERVAL_MS = 60_000;
export const SESSION_STATUS_POLL_INTERVAL_MS = 3_000;
export const SESSION_STORE_PAYLOAD_THROTTLE_MS = 30_000;

export function getThemeMode(preference: ColorModePreference, systemMode: ColorMode): ColorMode {
  if (preference === "system") {
    return systemMode;
  }
  return preference;
}

/**
 * Return the default model for a provider.
 * Reads from the server-fetched config cache (falls back to built-in defaults).
 */
export function getModel(provider: string): string {
  return getDefaultModelForProvider(provider);
}

/**
 * Return the model options for a provider.
 * Reads from the server-fetched config cache (falls back to built-in defaults).
 */
export function getModelOptions(provider: string): ModelOption[] {
  return getModelOptionsForProvider(provider);
}
