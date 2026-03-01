/**
 * Pi provider and model mapping utilities.
 * Handles provider resolution and model aliasing.
 * Extracted from piRpcSession.js for better maintainability.
 */
import {
    DEFAULT_PROVIDER_MODEL_ALIASES,
    DEFAULT_SERVER_HOST,
    LOOPBACK_HOSTS,
    loadModelsConfig,
    loadPiConfig,
    PI_PROVIDER_FALLBACK,
} from "../config/index.js";
import { getActiveOverlay, getPreviewHost } from "../utils/index.js";

/**
 * Check if a host is a loopback address.
 *
 * @param {string} rawHost - Host string to check
 * @returns {boolean} True if loopback
 */
export function isLoopbackHost(rawHost) {
    const host = String(rawHost || "").toLowerCase();
    if (!host) return false;
    if (LOOPBACK_HOSTS.length === 0) return false;
    return LOOPBACK_HOSTS.some(
        (alias) =>
            host === alias || host.startsWith(`${alias}:`) || host === `[${alias}]` || host.startsWith(`[${alias}]:`),
    );
}

/**
 * Map client short model names to Pi CLI model IDs.
 *
 * @param {string} clientModel - Client model name
 * @param {string} piProvider - Pi provider name
 * @returns {string} Pi model ID
 */
export function toPiModel(clientModel, piProvider) {
    if (piProvider !== "anthropic" || !clientModel) return clientModel;
    try {
        const modelsConfig = loadModelsConfig();
        const aliases = modelsConfig.modelAliases ?? DEFAULT_PROVIDER_MODEL_ALIASES;
        return aliases[clientModel] ?? clientModel;
    } catch (_) {
        return DEFAULT_PROVIDER_MODEL_ALIASES[clientModel] ?? clientModel;
    }
}

/**
 * Extract hostname the client used to connect (from Host header).
 *
 * @param {import('socket.io').Socket} socket - Socket.io socket
 * @returns {string} hostname, or "" if unavailable
 */
export function getRemoteHostFromSocket(socket) {
    const hostHeader = String(socket?.handshake?.headers?.host ?? "").trim();
    const host = hostHeader.split(":")[0]?.trim() ?? "";
    if (!host) return "";
    return isLoopbackHost(host) ? DEFAULT_SERVER_HOST : host;
}

/**
 * Derive connection context from socket for Pi agent awareness.
 *
 * @param {import('socket.io').Socket} socket - Socket.io socket
 * @returns {string} "local", "tunnel remote host", or "remote"
 */
export function getConnectionContext(socket) {
    const addr = String(socket?.handshake?.address ?? socket?.conn?.remoteAddress ?? "");
    const host = String((socket?.handshake?.headers?.host ?? "").split(":")[0] ?? "");
    const isLocal = isLoopbackHost(addr) || isLoopbackHost(host);

    const overlay = getActiveOverlay();
    if (overlay === "tunnel") {
        const tunnelHeader = socket?.handshake?.headers?.["x-tunnel-proxy"];
        if (tunnelHeader) return "tunnel remote host";
        if (isLocal) return DEFAULT_SERVER_HOST;
        return "tunnel remote host";
    }

    if (isLocal) return DEFAULT_SERVER_HOST;
    return "remote";
}

/**
 * Map client provider + model to the Pi CLI --provider value.
 *
 * Pi CLI providers (from `pi --list-models`):
 *   - google-gemini-cli  → gemini-2.x, gemini-3.x-preview, gemini-3.1-*
 *   - google-antigravity  → gemini-3-pro-low, gemini-3-pro-high, gemini-3-flash
 *   - anthropic           → claude-*
 *   - openai              → gpt-*, codex-*
 *
 * @param {string} clientProvider - Client provider name
 * @param {string} model - Model name
 * @returns {string} Pi provider name
 */
export function getPiProviderForModel(clientProvider, model) {
    const piConfig = loadPiConfig();
    const routing = piConfig.providerRouting ?? {};
    const rules = routing.rules ?? [];
    const fallback = routing.fallback ?? {};
    const providerMap = piConfig.providerMapping ?? {};

    const compileModelPattern = (pattern, context) => {
        if (!pattern) return null;
        try {
            return new RegExp(pattern);
        } catch (error) {
            console.warn(`Skipping invalid ${context} regex "${pattern}" in pi config`, error);
            return null;
        }
    };

    if (typeof model === "string") {
        // Evaluate routing rules in order; first match wins
        for (const rule of rules) {
            const matchPattern = compileModelPattern(rule.modelPattern, "modelPattern");
            if (!matchPattern || !matchPattern.test(model)) {
                continue;
            }
            const excludePattern = compileModelPattern(rule.excludePattern, "excludePattern");
            if (excludePattern && excludePattern.test(model)) {
                continue;
            }
            if (!rule.provider) {
                continue;
            }
            return rule.provider;
        }
    }

    // Fallback by client provider name
    if (fallback[clientProvider]) return fallback[clientProvider];
    if (providerMap[clientProvider]) return providerMap[clientProvider];
    return PI_PROVIDER_FALLBACK;
}
