/**
 * Dynamic model configuration loader.
 *
 * Fetches models from the server's /api/models endpoint so that editing
 * config/models.json is all that is needed — no code changes required.
 */
import type { Provider } from "@/theme/index";
import { getDefaultServerConfig } from "./config";

export type ModelOption = { value: string; label: string };

export type ProviderModelsConfig = {
  label?: string;
  piProvider?: string;
  defaultModel: string;
  models: ModelOption[];
};

export type ModelsConfig = {
  providers: Record<string, ProviderModelsConfig>;
  modelAliases?: Record<string, string>;
};

/** In-memory cache so we don't re-fetch on every render. */
let modelsConfigCache: ModelsConfig | null = null;

/** Hard-coded fallback in case the server is unreachable. */
export const FALLBACK_CONFIG: ModelsConfig = {
  providers: {
    claude: {
      defaultModel: "sonnet4.5",
      models: [{ value: "sonnet4.5", label: "Sonnet 4.5" }],
    },
    gemini: {
      defaultModel: "gemini-3.1-pro-preview",
      models: [
        { value: "gemini-3.1-pro-preview", label: "3.1 Pro Preview" },
      ],
    },
    codex: {
      defaultModel: "gpt-5.1-codex-mini",
      models: [
        { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
      ],
    },
  },
};

export function getFallbackModelOptionsForProvider(provider: Provider): ModelOption[] {
  return FALLBACK_CONFIG.providers[provider]?.models ?? [];
}

export function getFallbackDefaultModelForProvider(provider: Provider): string {
  return FALLBACK_CONFIG.providers[provider]?.defaultModel ?? "";
}

const FETCH_MAX_RETRIES = 4;
const FETCH_BASE_DELAY_MS = 1500;

async function fetchWithRetry(url: string, retries: number): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status >= 500 || response.status === 404) {
        if (attempt < retries) {
          const delay = FETCH_BASE_DELAY_MS * Math.pow(2, attempt);
          console.log(`[modelsApi] Retry ${attempt + 1}/${retries} in ${delay}ms (HTTP ${response.status})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      return response;
    } catch (err) {
      if (attempt < retries) {
        const delay = FETCH_BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[modelsApi] Retry ${attempt + 1}/${retries} in ${delay}ms (${(err as Error)?.message})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return fetch(url);
}

/**
 * Fetch the model configuration from the server.
 * Returns the cached value on subsequent calls.
 * Call `invalidateModelsCache()` to force a re-fetch.
 *
 * Retries with exponential backoff to handle transient tunnel failures
 * (e.g. Cloudflare quick tunnels returning 404 during reconnection).
 */
export async function fetchModelsConfig(): Promise<ModelsConfig> {
  if (modelsConfigCache) return modelsConfigCache;
  try {
    const baseUrl = getDefaultServerConfig().getBaseUrl();
    const url = `${baseUrl}/api/models`;
    const response = await fetchWithRetry(url, FETCH_MAX_RETRIES);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: ModelsConfig = await response.json();
    if (!data?.providers || typeof data.providers !== "object") {
      throw new Error("Invalid models config response");
    }
    modelsConfigCache = data;
    return data;
  } catch (err) {
    console.warn("[modelsApi] Could not fetch /api/models, using fallback:", (err as Error)?.message);
    return FALLBACK_CONFIG;
  }
}

/** Force next `fetchModelsConfig()` call to re-fetch from the server. */
export function invalidateModelsCache(): void {
  modelsConfigCache = null;
}

/** Synchronous getter — returns cache or fallback. Never null. */
export function getModelsConfigSync(): ModelsConfig {
  return modelsConfigCache ?? FALLBACK_CONFIG;
}

export function getModelOptionsForProvider(provider: string): ModelOption[] {
  return getModelsConfigSync().providers[provider]?.models ?? [];
}

export function getDefaultModelForProvider(provider: string): string {
  return getModelsConfigSync().providers[provider]?.defaultModel ?? "";
}
