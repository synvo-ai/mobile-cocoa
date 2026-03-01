/**
 * Model Options — Mobile App (BUILD-TIME FALLBACK ONLY)
 *
 * The app fetches models dynamically from /api/models at startup.
 * These values are build-time fallbacks and stay in sync with
 * the shared fallback config in services/server/modelsApi.ts.
 */
import type { Provider } from "@/theme/index";
import type { ModelOption } from "@/services/server/modelsApi";
import {
  getFallbackDefaultModelForProvider,
  getFallbackModelOptionsForProvider,
} from "@/services/server/modelsApi";

export const CLAUDE_MODELS: ModelOption[] = getFallbackModelOptionsForProvider("claude");
export const GEMINI_MODELS: ModelOption[] = getFallbackModelOptionsForProvider("gemini");
export const CODEX_MODELS: ModelOption[] = getFallbackModelOptionsForProvider("codex");

export const MODEL_OPTIONS_BY_PROVIDER: Record<Provider, ModelOption[]> = {
  claude: CLAUDE_MODELS,
  gemini: GEMINI_MODELS,
  codex:  CODEX_MODELS,
};

// Default models — must stay in sync with config/models.json → providers[x].defaultModel
export const DEFAULT_CLAUDE_MODEL = getFallbackDefaultModelForProvider("claude");
export const DEFAULT_GEMINI_MODEL = getFallbackDefaultModelForProvider("gemini");
export const DEFAULT_CODEX_MODEL = getFallbackDefaultModelForProvider("codex");

export type { ModelOption, Provider };
