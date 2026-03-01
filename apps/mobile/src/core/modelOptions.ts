/**
 * Model Options — Mobile App (BUILD-TIME FALLBACK ONLY)
 *
 * The app fetches models dynamically from /api/models at startup.
 * These constants are only used as fallback types and are NOT the
 * source of truth. Edit config/models.json to add/remove/rename models.
 */

import type { Provider } from "@/theme/index";

export type ModelOption = {
  value: string;
  label: string;
};

export const CLAUDE_MODELS: ModelOption[] = [
  { value: "sonnet4.5",               label: "Sonnet 4.5" },
  { value: "opus4.5",                label: "Opus 4.5" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

export const GEMINI_MODELS: ModelOption[] = [
  { value: "gemini-3.1-flash",        label: "3.1 Flash" },
  { value: "gemini-3.1-pro-low",      label: "3.1 Pro Low" },
  { value: "gemini-3.1-pro-high",     label: "3.1 Pro High" },
  { value: "gemini-3.1-pro-preview",  label: "3.1 Pro Preview" },
];

export const CODEX_MODELS: ModelOption[] = [
  { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
  { value: "gpt-5.2-codex",      label: "GPT-5.2 Codex" },
];

export const MODEL_OPTIONS_BY_PROVIDER: Record<Provider, ModelOption[]> = {
  claude: CLAUDE_MODELS,
  gemini: GEMINI_MODELS,
  codex:  CODEX_MODELS,
};

// Default models — must stay in sync with config/models.json → providers[x].defaultModel
export const DEFAULT_CLAUDE_MODEL = "sonnet4.5";
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-pro-preview";
export const DEFAULT_CODEX_MODEL  = "gpt-5.1-codex-mini";

export type { Provider };
