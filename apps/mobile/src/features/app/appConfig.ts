import type { ModelOption } from "@/core/modelOptions";
import type { Message } from "@/core";
import { getModelsConfigSync } from "@/services/server/modelsApi";
import { ColorMode, ColorModePreference } from "@/theme";
import { getBackendPermissionMode, type PermissionModeUI } from "@/utils/permission";

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

export function getDefaultPermissionModeUI(): PermissionModeUI {
  return typeof process !== "undefined" &&
    (process.env?.EXPO_PUBLIC_DEFAULT_PERMISSION_MODE === "always_ask" ||
      process.env?.EXPO_PUBLIC_DEFAULT_PERMISSION_MODE === "acceptEdits" ||
      process.env?.EXPO_PUBLIC_DEFAULT_PERMISSION_MODE === "acceptPermissions")
    ? "always_ask"
    : "yolo";
}

/**
 * Return the default model for a provider.
 * Reads from the server-fetched config cache (falls back to built-in defaults).
 */
export function getModel(provider: string): string {
  const cfg = getModelsConfigSync();
  return cfg.providers[provider]?.defaultModel ?? "";
}

/**
 * Return the model options for a provider.
 * Reads from the server-fetched config cache (falls back to built-in defaults).
 */
export function getModelOptions(provider: string): ModelOption[] {
  const cfg = getModelsConfigSync();
  return cfg.providers[provider]?.models ?? [];
}

export function getSubmitPermissionConfig(permissionModeUI: PermissionModeUI, provider: string) {
  const backend = getBackendPermissionMode(permissionModeUI, provider);
  const codexOptions =
    provider === "codex"
      ? {
          askForApproval: backend.askForApproval,
          fullAuto: backend.fullAuto,
          yolo: backend.yolo,
        }
      : undefined;

  return {
    backend,
    codexOptions,
  };
}
