import type { IServerConfig } from "@/core/types";
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  DEFAULT_ANDROID_EMULATOR_HOST,
  DEFAULT_LOCALHOST_HOSTS,
  DEFAULT_SERVER_BASE_URL,
} from "./config.defaults";

/**
 * Connection mode for the mobile app.
 *   - "direct"     : Direct URL connection (localhost, LAN, etc.)
 *   - "cloudflare" : Cloudflare Tunnel — base URL is tunnel URL; proxy uses X-Target-Port / _targetPort
 */
export type ConnectionMode = "direct" | "cloudflare";

function getConnectionMode(): ConnectionMode {
  const mode =
    typeof process !== "undefined" ? (process.env?.EXPO_PUBLIC_CONNECTION_MODE ?? "").trim().toLowerCase() : "";
  if (mode === "direct" || mode === "cloudflare") {
    return mode as ConnectionMode;
  }
  return "direct";
}

function parseEnvHost(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `http://${trimmed}`);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function parseHostFromRuntimeMetadata(): string | null {
  if (typeof process === "undefined") return null;
  const appConstants = Constants as unknown as {
    manifest?: Record<string, unknown>;
    expoConfig?: Record<string, unknown>;
    expoGoConfig?: Record<string, unknown>;
  };
  const rawCandidates = [
    appConstants.manifest?.debuggerHost,
    appConstants.manifest?.hostUri,
    appConstants.expoConfig?.hostUri,
    appConstants.expoGoConfig?.hostUri,
  ];

  for (const candidate of rawCandidates) {
    const host = parseEnvHost(typeof candidate === "string" ? candidate : "");
    if (host) return host;
  }
  return null;
}

let localBaseUrlRewriteWarned = false;
let localBaseUrlWarned = false;

function getServerHostOverride(): string | null {
  if (typeof process === "undefined") return null;
  const explicitHost =
    parseEnvHost(process.env?.EXPO_PUBLIC_SERVER_HOST ?? "") ||
    parseEnvHost(process.env?.EXPO_PUBLIC_SERVER_IP ?? "") ||
    parseEnvHost(process.env?.EXPO_PUBLIC_HOST_IP ?? "");
  if (explicitHost) return explicitHost;
  const runtimeHost = parseHostFromRuntimeMetadata();
  if (runtimeHost) return runtimeHost;
  if (Platform.OS === "android") return DEFAULT_ANDROID_EMULATOR_HOST;
  return null;
}

function normalizeBaseUrl(rawUrl: string): string {
  const base = rawUrl.trim();
  if (!base) return base;
  try {
    const parsed = new URL(base);
    const host = parsed.hostname.toLowerCase();
    if (!DEFAULT_LOCALHOST_HOSTS.includes(host)) {
      return base.replace(/\/$/, "");
    }

    const replacementHost = getServerHostOverride();
    if (!replacementHost) {
      if (Platform.OS !== "web") {
        if (!localBaseUrlWarned) {
          localBaseUrlWarned = true;
          console.warn(
            "[ServerConfig] Base URL still points to localhost on mobile. Set EXPO_PUBLIC_SERVER_HOST (or EXPO_PUBLIC_SERVER_IP) to a reachable host."
          );
        }
      }
      return base.replace(/\/$/, "");
    }

    if (replacementHost === host) return base.replace(/\/$/, "");
    parsed.hostname = replacementHost;
    const normalized = parsed.toString().replace(/\/$/, "");
    if (!localBaseUrlRewriteWarned) {
      localBaseUrlRewriteWarned = true;
      console.log(
        `[ServerConfig] Rewrote base host from ${host} to ${replacementHost} for ${Platform.OS} runtime.`
      );
    }
    return normalized;
  } catch {
    return base.replace(/\/$/, "");
  }
}

/**
 * Default server config (env-based). Inject IServerConfig in tests or for different backends.
 */
function getBaseUrlFromEnv(): string {
  const url =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_SERVER_URL
      ? process.env.EXPO_PUBLIC_SERVER_URL
      : DEFAULT_SERVER_BASE_URL;
  return normalizeBaseUrl(url);
}

/**
 * Resolve a preview URL based on connection mode and base URL.
 * Pure function — independently testable, no side effects beyond console.log.
 */
export function resolvePreviewUrlForMode(
  previewUrl: string,
  base: string,
  connectionMode: ConnectionMode
): string {
  try {
    const baseParsed = new URL(base);
    const parsed = new URL(previewUrl);
    const basePort = baseParsed.port || (baseParsed.protocol === "https:" ? "443" : "80");
    const previewPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");

    // ── Cloudflare (tunnel) mode ──────────────────────────────────────────────
    if (connectionMode === "cloudflare") {
      const isPreviewLocalhost = DEFAULT_LOCALHOST_HOSTS.includes(parsed.hostname);
      if (isPreviewLocalhost) {
        const targetPort = previewPort !== basePort ? previewPort : basePort;
        const proxyUrl = new URL(base);
        proxyUrl.pathname = parsed.pathname || "/";
        proxyUrl.search = parsed.search || "";
        proxyUrl.hash = parsed.hash || "";
        if (targetPort !== basePort) {
          proxyUrl.searchParams.set("_targetPort", targetPort);
        }
        const resolved = proxyUrl.toString();
        if (__DEV__) {
          console.log(
            `[PreviewURL] resolvePreviewUrl (${connectionMode}): incoming=${previewUrl} | resolved=${resolved}`
          );
        }
        return resolved;
      }
      if (__DEV__) {
        console.log(`[PreviewURL] resolvePreviewUrl (${connectionMode}): keep as-is | incoming=${previewUrl}`);
      }
      return previewUrl;
    }

    // ── Direct mode ─────────────────────────────────────────────────────────
    const isSameHost =
      DEFAULT_LOCALHOST_HOSTS.includes(parsed.hostname) || parsed.hostname === baseParsed.hostname;
    const isSamePort = previewPort === basePort;
    if (isSameHost && isSamePort) {
      const pathname = (parsed.pathname || "/").replace(/^\//, "") || "index.html";
      const cleanUrl = `${base.replace(/\/$/, "")}/${pathname}${parsed.search || ""}${parsed.hash || ""}`;
      if (__DEV__) {
        console.log(`[PreviewURL] resolvePreviewUrl: base=${base} | incoming=${previewUrl} | resolved=${cleanUrl}`);
      }
      return cleanUrl;
    }

    // Different port: replace localhost with a reachable host.
    const isPreviewLocalhost = DEFAULT_LOCALHOST_HOSTS.includes(parsed.hostname);
    if (isPreviewLocalhost && baseParsed.hostname) {
      const baseIsLocal = DEFAULT_LOCALHOST_HOSTS.includes(baseParsed.hostname);
      const previewHostRaw = typeof process !== "undefined" ? (process.env.EXPO_PUBLIC_PREVIEW_HOST ?? "").trim() : "";
      let portToPortHost = baseParsed.hostname;
      if (baseIsLocal && previewHostRaw) {
        try {
          portToPortHost = new URL(
            previewHostRaw.startsWith("http") ? previewHostRaw : `http://${previewHostRaw}`
          ).hostname;
        } catch {
          portToPortHost = previewHostRaw;
        }
      }
      const portSuffix = parsed.port ? `:${parsed.port}` : "";
      const rewritten = `${baseParsed.protocol}//${portToPortHost}${portSuffix}${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
      if (__DEV__) {
        console.log(`[PreviewURL] resolvePreviewUrl: port-to-port | incoming=${previewUrl} | resolved=${rewritten}`);
      }
      return rewritten;
    }

    if (__DEV__) {
      console.log(`[PreviewURL] resolvePreviewUrl: keep as-is | incoming=${previewUrl}`);
    }
    return previewUrl;
  } catch (e) {
    if (__DEV__) {
      console.log(
        `[PreviewURL] resolvePreviewUrl: parse error, using as-is | incoming=${previewUrl} | error=${String(e)}`
      );
    }
    return previewUrl;
  }
}

export function createDefaultServerConfig(): IServerConfig {
  const connectionMode = getConnectionMode();
  return {
    getBaseUrl: getBaseUrlFromEnv,
    resolvePreviewUrl(previewUrl: string): string {
      return resolvePreviewUrlForMode(previewUrl, getBaseUrlFromEnv(), connectionMode);
    },
  };
}


/** Singleton default for app use when no DI container is used. */
let defaultInstance: IServerConfig | null = null;

export function getDefaultServerConfig(): IServerConfig {
  if (!defaultInstance) defaultInstance = createDefaultServerConfig();
  return defaultInstance;
}
