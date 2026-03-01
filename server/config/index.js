/**
 * Server configuration and environment variables.
 *
 * This module centralizes runtime defaults and config loading paths.
 * All non-environment fallback values come from `config/defaults.json`, with
 * environment variables available to override runtime behavior.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// Get current directory and project root for path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

// Config files
const MODELS_CONFIG_PATH = path.join(projectRoot, "config", "models.json");
const PI_CONFIG_PATH = path.join(projectRoot, "config", "pi.json");
const SKILLS_CONFIG_PATH = path.join(projectRoot, "config", "skills.json");
export { MODELS_CONFIG_PATH, PI_CONFIG_PATH, SKILLS_CONFIG_PATH };
const DEFAULTS_CONFIG_PATH = path.join(projectRoot, "config", "defaults.json");
const SERVER_CONFIG_PATH = path.join(projectRoot, "config", "server.json");

function loadConfigFile(filePath, { label, optional = false } = {}) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== "object") {
      throw new Error("Config parsed to non-object");
    }
    return cfg;
  } catch (err) {
    if (!optional) {
      console.warn(`[config] Failed to load ${label || path.basename(filePath)}:`, err?.message);
    }
    return null;
  }
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function parseIntOrDefault(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function asStringSafe(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRequiredString(value, label) {
  const str = asStringSafe(value, "");
  if (!str) throw new Error(`[config] Missing required config string: ${label}`);
  return str;
}

function asRequiredNumber(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed)) return parsed;
  throw new Error(`[config] Missing required config number: ${label}`);
}

function asRequiredStringList(value, label) {
  if (!Array.isArray(value)) throw new Error(`[config] Missing/invalid config string list: ${label}`);
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function isInsideRoot(rootDir, targetPath) {
  const rel = path.relative(rootDir, targetPath);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

// Baseline defaults used when models/pi/skills config files are missing or invalid.
const FALLBACKS = asObject(loadConfigFile(DEFAULTS_CONFIG_PATH, { label: "config/defaults.json" }));
const SERVER_DEFAULTS = asObject(FALLBACKS.server);
const MODELS_DEFAULTS = asObject(FALLBACKS.models);
const PI_DEFAULTS = asObject(FALLBACKS.pi);
const SKILLS_DEFAULTS = asObject(FALLBACKS.skills);

// User-specific server overrides — config/server.json (higher priority than defaults.json, no .env needed)
const SERVER_OVERRIDES = asObject(loadConfigFile(SERVER_CONFIG_PATH, { label: "config/server.json", optional: true }));

// Optional local aliases/path values from defaults config
const DEFAULT_PROXY_CONFIG = asObject(SERVER_DEFAULTS.proxy);
const DEFAULT_MOBILE_CONFIG = asObject(SERVER_DEFAULTS.mobile);
const DEFAULT_SESSION_CONFIG = asObject(SERVER_DEFAULTS.sessions);

export const LOOPBACK_HOSTS = asRequiredStringList(SERVER_DEFAULTS.loopbackHosts, "server.loopbackHosts");

export const DEFAULT_PERMISSION_MODE_FROM_CONFIG = asRequiredString(
  SERVER_OVERRIDES.defaultPermissionMode ?? SERVER_DEFAULTS.defaultPermissionMode,
  "server.defaultPermissionMode",
);
export const DEFAULT_PROVIDER_FROM_CONFIG = asRequiredString(
  SERVER_OVERRIDES.defaultProvider ?? SERVER_DEFAULTS.defaultProvider,
  "server.defaultProvider",
);

const DEFAULT_PORT_FROM_CONFIG = asRequiredNumber(
  SERVER_OVERRIDES.port ?? SERVER_DEFAULTS.port,
  "server.port",
);
const DEFAULT_SIDEBAR_REFRESH_INTERVAL_MS = asRequiredNumber(
  SERVER_DEFAULTS.sidebarRefreshIntervalMs,
  "server.sidebarRefreshIntervalMs",
);
const DEFAULT_PI_CLI_PATH = PI_DEFAULTS?.cliPath
  ? asRequiredString(PI_DEFAULTS.cliPath, "pi.cliPath")
  : asRequiredString(SERVER_DEFAULTS.pi?.cliPath, "server.pi.cliPath");
const DEFAULT_SESSIONS_DIR = asRequiredString(DEFAULT_SESSION_CONFIG?.agentDir, "server.sessions.agentDir");
const DEFAULT_PROXY_PORT = asRequiredNumber(DEFAULT_PROXY_CONFIG.port, "server.proxy.port");
const DEFAULT_PROXY_BIND_HOST = asRequiredString(DEFAULT_PROXY_CONFIG.bindHost, "server.proxy.bindHost");
const DEFAULT_PROXY_LOOPBACK_HOST = asRequiredString(DEFAULT_PROXY_CONFIG.loopbackHost, "server.proxy.loopbackHost");
const DEFAULT_PROXY_TARGET_HOST = asRequiredString(DEFAULT_PROXY_CONFIG.defaultTargetHost, "server.proxy.defaultTargetHost");
const DEFAULT_PROXY_DEFAULT_TARGET_PORT = asRequiredNumber(
  DEFAULT_PROXY_CONFIG.defaultTargetPort,
  "server.proxy.defaultTargetPort",
);
const DEFAULT_LOG_HOST = asRequiredString(SERVER_DEFAULTS.logHost, "server.logHost");
const DEFAULT_LISTEN_HOST = asRequiredString(SERVER_DEFAULTS.listenHost, "server.listenHost");
const DEFAULT_SERVER_URL_VALUE = asRequiredString(SERVER_DEFAULTS.mobile?.defaultServerUrl, "server.mobile.defaultServerUrl");
const DEFAULT_SSE_HOST_VALUE = asRequiredString(SERVER_DEFAULTS.sseHost, "server.sseHost");
const DEFAULT_TUNNEL_PROXY_PORT_FROM_CONFIG = asRequiredNumber(
  DEFAULT_MOBILE_CONFIG.tunnelProxyPort,
  "server.mobile.tunnelProxyPort",
);
const DEFAULT_ANDROID_EMULATOR_HOST = asRequiredString(
  DEFAULT_MOBILE_CONFIG.androidEmulatorHost,
  "server.mobile.androidEmulatorHost",
);
const DEFAULT_LOCALHOST_ALIASES = asRequiredStringList(
  DEFAULT_MOBILE_CONFIG.localhostAliases,
  "server.mobile.localhostAliases",
);

// ── External models config ──────────────────────────────────────────────────
/** Load and parse models config from disk. Falls back to defaults config. */
export function loadModelsConfig() {
  try {
    const raw = fs.readFileSync(MODELS_CONFIG_PATH, "utf8");
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg.providers !== "object") {
      throw new Error("Missing 'providers' key in models.json");
    }
    return cfg;
  } catch (err) {
    console.warn("[models-config] Could not load config/models.json — using defaults.json fallback:", err?.message);
    return MODELS_DEFAULTS;
  }
}

/** Fallback model defaults by client provider (for hard-failure recovery). */
export const DEFAULT_PROVIDER_MODELS =
  (SERVER_DEFAULTS?.fallback?.providerModels && typeof SERVER_DEFAULTS.fallback.providerModels === "object"
    ? SERVER_DEFAULTS.fallback.providerModels
    : {});

/** Fallback model aliases when alias file is missing/invalid. */
export const DEFAULT_PROVIDER_MODEL_ALIASES =
  (SERVER_DEFAULTS?.fallback?.providerModelAliases && typeof SERVER_DEFAULTS.fallback.providerModelAliases === "object"
    ? SERVER_DEFAULTS.fallback.providerModelAliases
    : {});

// ── External Pi config ──────────────────────────────────────────────────────
/** Load and parse Pi config from disk. Falls back to defaults config. */
export function loadPiConfig() {
  try {
    const raw = fs.readFileSync(PI_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[pi-config] Could not load config/pi.json — using defaults.json fallback:", err?.message);
    return PI_DEFAULTS;
  }
}

export const PI_FALLBACK_MODEL = asStringSafe(PI_DEFAULTS.fallbackModel,
  asStringSafe(SERVER_DEFAULTS.pi?.fallbackModel, ""));
export const PI_PROVIDER_FALLBACK = asStringSafe(PI_DEFAULTS.providerFallback,
  asStringSafe(SERVER_DEFAULTS.pi?.providerFallback, "openai"));

export const PI_SYSTEM_PROMPTS = asObject(PI_DEFAULTS.systemPrompts);
export const PI_SYSTEM_PROMPT_TERMINAL_RULES = asStringSafe(
  PI_SYSTEM_PROMPTS.terminalRules,
  "",
);

// ── External Skills config ──────────────────────────────────────────────────
/** Load and parse the skills config from disk. Falls back to defaults config. */
export function loadSkillsConfig() {
  try {
    const raw = fs.readFileSync(SKILLS_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[skills-config] Could not load config/skills.json — using defaults.json fallback:", err?.message);
    return SKILLS_DEFAULTS;
  }
}

// ── Workspace path resolution ─────────────────────────────────────────────
/**
 * Resolve workspace directory from CLI or env.
 * Priority: --workspace flag > positional arg > WORKSPACE env > WORKSPACE_CWD env > default
 */
function resolveWorkspaceCwd() {
  const args = process.argv.slice(2);
  let fromCli = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--workspace" && args[i + 1]) {
      fromCli = args[i + 1];
      break;
    }
    if (!args[i].startsWith("-")) {
      fromCli = args[i];
      break;
    }
  }

  const raw = fromCli ?? process.env.WORKSPACE ?? process.env.WORKSPACE_CWD ?? projectRoot;
  const resolved = path.resolve(raw);

  if (!fs.existsSync(resolved)) {
    console.warn(`[workspace] Path does not exist: ${resolved}. Using server directory.`);
    return projectRoot;
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    console.warn(`[workspace] Not a directory: ${resolved}. Using server directory.`);
    return projectRoot;
  }
  return resolved;
}

// Server port/listener + behavior defaults
export const PORT = DEFAULT_PORT_FROM_CONFIG;
export const WORKSPACE_ALLOWED_ROOT = path.resolve(os.homedir());

let currentWorkspaceCwd = resolveWorkspaceCwd();

/** Config key for sidebar refresh interval. */
export const SIDEBAR_REFRESH_INTERVAL_MS =
  parseIntOrDefault(process.env.SIDEBAR_REFRESH_INTERVAL_MS, DEFAULT_SIDEBAR_REFRESH_INTERVAL_MS);

/** Config key for default permission mode. */
export const DEFAULT_PERMISSION_MODE = DEFAULT_PERMISSION_MODE_FROM_CONFIG;

/** Canonical provider names recognized throughout the app. */
export const VALID_PROVIDERS = Object.freeze(["claude", "gemini", "codex"]);

/** Validate default provider. */
export const DEFAULT_PROVIDER =
  VALID_PROVIDERS.includes(DEFAULT_PROVIDER_FROM_CONFIG)
    ? DEFAULT_PROVIDER_FROM_CONFIG
    : "codex";

// PI + session/runtime settings
export const PI_CLI_PATH = process.env.PI_CLI_PATH || DEFAULT_PI_CLI_PATH;
export const SESSIONS_ROOT = path.join(projectRoot, DEFAULT_SESSIONS_DIR);

// Docker flag — read from config/server.json (enableDockerManager) or config/defaults.json
export const ENABLE_DOCKER_MANAGER = SERVER_OVERRIDES.enableDockerManager === true
  || SERVER_OVERRIDES.enableDockerManager === 1
  || SERVER_DEFAULTS.enableDockerManager === true;

/**
 * Returns the active overlay network type.
 * @returns {"tunnel" | "none"}
 */
export function getOverlayNetwork() {
  const raw = typeof process.env.OVERLAY_NETWORK === "string" ? process.env.OVERLAY_NETWORK.trim().toLowerCase() : "";
  return raw === "tunnel" ? "tunnel" : "none";
}

// Tunnel/proxy settings
export const TUNNEL_PROXY_PORT = parseIntOrDefault(process.env.PROXY_PORT, DEFAULT_PROXY_PORT);
export const PROXY_DEFAULT_TARGET_PORT = parseIntOrDefault(
  process.env.PROXY_DEFAULT_TARGET_PORT,
  parseIntOrDefault(process.env.PORT, DEFAULT_PROXY_DEFAULT_TARGET_PORT),
);
export const PROXY_BIND_HOST = asStringSafe(process.env.PROXY_BIND, DEFAULT_PROXY_BIND_HOST);
export const PROXY_LOOPBACK_HOST = DEFAULT_PROXY_LOOPBACK_HOST;
export const PROXY_DEFAULT_TARGET_HOST = DEFAULT_PROXY_TARGET_HOST;
export const DEFAULT_SERVER_HOST = DEFAULT_LOG_HOST;
export const SERVER_LISTEN_HOST = DEFAULT_LISTEN_HOST;
export const DEFAULT_SSE_HOST = DEFAULT_SSE_HOST_VALUE;
export const DEFAULT_SERVER_URL = DEFAULT_SERVER_URL_VALUE;
export const DEFAULT_TUNNEL_PROXY_PORT = DEFAULT_TUNNEL_PROXY_PORT_FROM_CONFIG;
export const ANDROID_EMULATOR_HOST = DEFAULT_ANDROID_EMULATOR_HOST;
export const MOBILE_LOCALHOST_ALIASES = DEFAULT_LOCALHOST_ALIASES;

// Workspace mutable reference
export function getWorkspaceCwd() {
  return currentWorkspaceCwd;
}

export function setWorkspaceCwd(newPath) {
  if (typeof newPath !== "string" || !newPath.trim()) {
    return { ok: false, error: "Path is required" };
  }
  const resolved = path.resolve(newPath);
  try {
    if (!fs.existsSync(resolved)) return { ok: false, error: "Path does not exist" };
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return { ok: false, error: "Path is not a directory" };

    const allowedRootReal = (() => {
      try {
        return fs.realpathSync(WORKSPACE_ALLOWED_ROOT);
      } catch {
        return path.resolve(WORKSPACE_ALLOWED_ROOT);
      }
    })();
    const resolvedReal = fs.realpathSync(resolved);
    if (!isInsideRoot(allowedRootReal, resolvedReal)) {
      return { ok: false, error: `Path must be under ${WORKSPACE_ALLOWED_ROOT}` };
    }
    currentWorkspaceCwd = resolvedReal;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || "Invalid path" };
  }
}

// Export project paths
export { projectRoot, __dirname };
