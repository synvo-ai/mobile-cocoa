import {
    CLAUDE_MODELS, CODEX_MODELS, DEFAULT_CLAUDE_MODEL,
    DEFAULT_CODEX_MODEL,
    DEFAULT_GEMINI_MODEL, GEMINI_MODELS
} from "@/constants/modelOptions";
import type { Message } from "@/core";
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

export function getModel(provider: string): string {
  return provider === "claude"
    ? DEFAULT_CLAUDE_MODEL
    : provider === "gemini"
      ? DEFAULT_GEMINI_MODEL
      : DEFAULT_CODEX_MODEL;
}

export function getModelOptions(provider: string) {
  return provider === "claude" ? CLAUDE_MODELS : provider === "codex" ? CODEX_MODELS : GEMINI_MODELS;
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
