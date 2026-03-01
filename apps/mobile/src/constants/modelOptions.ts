/**
 * Model Options
 */

import type { Provider } from "@/theme/index";

export type ModelOption = {
  value: string;
  label: string;
};

export const CLAUDE_MODELS: ModelOption[] = [
  { value: "sonnet4.5", label: "Sonnet 4.5" },
  { value: "opus4.5", label: "Opus 4.5" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

export const ANTIGRAVITY_MODELS: ModelOption[] = [
  { value: "gemini-3.1-flash", label: "3.1 Flash" },
  { value: "gemini-3.1-pro-low", label: "3.1 Pro Low" },
  { value: "gemini-3.1-pro-high", label: "3.1 Pro High" },
];

export const CODEX_MODELS: ModelOption[] = [
  { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
  { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
];



export const MODEL_OPTIONS_BY_PROVIDER: Record<Provider, ModelOption[]> = {
  claude: CLAUDE_MODELS,
  antigravity: ANTIGRAVITY_MODELS,
  codex: CODEX_MODELS,
};

export const DEFAULT_CLAUDE_MODEL = "sonnet4.5";
export const DEFAULT_ANTIGRAVITY_MODEL = "gemini-3.1-flash";
export const DEFAULT_CODEX_MODEL = "gpt-5.1-codex-mini";

export type { Provider };
