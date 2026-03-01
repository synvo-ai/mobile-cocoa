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
const DEFAULTS_CONFIG_PATH = path.join(projectRoot, "config", "defaults.json");

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

// Baseline defaults used when models/pi/skills config files are missing or invalid.
const FALLBACKS = asObject(loadConfigFile(DEFAULTS_CONFIG_PATH, { label: "config/defaults.json" }));
const SERVER_DEFAULTS = asObject(FALLBACKS.server);
const MODELS_DEFAULTS = asObject(FALLBACKS.models);
const PI_DEFAULTS = asObject(FALLBACKS.pi);
const SKILLS_DEFAULTS = asObject(FALLBACKS.skills);

// Optional local aliases/path values from defaults config
const DEFAULT_PROXY_CONFIG = asObject(SERVER_DEFAULTS.proxy);
const DEFAULT_MOBILE_CONFIG = asObject(SERVER_DEFAULTS.mobile);
const DEFAULT_SESSION_CONFIG = asObject(SERVER_DEFAULTS.sessions);
const DEFAULT_SCRIPTS = asObject(SERVER_DEFAULTS.scripts);

export const LOOPBACK_HOSTS = Array.isArray(SERVER_DEFAULTS.loopbackHosts)
  ? SERVER_DEFAULTS.loopbackHosts
  : [];

export const DEFAULT_PERMISSION_MODE_FROM_CONFIG = asStringSafe(SERVER_DEFAULTS.defaultPermissionMode, "");
export const DEFAULT_PROVIDER_FROM_CONFIG = asStringSafe(SERVER_DEFAULTS.defaultProvider, "");

// ── External models config ──────────────────────────────────────────────────
/** Absolute path to the models config JSON (config/models.json). */
export const MODELS_CONFIG_PATH = MODELS_CONFIG_PATH;
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
/** Absolute path to the Pi config JSON (config/pi.json). */
export const PI_CONFIG_PATH = PI_CONFIG_PATH;
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

export const PI_FALLBACK_MODEL = PI_DEFAULTS?.fallbackModel;
export const PI_PROVIDER_FALLBACK = PI_DEFAULTS?.providerFallback;

export const PI_SYSTEM_PROMPTS = asObject(PI_DEFAULTS.systemPrompts);

// ── External Skills config ──────────────────────────────────────────────────
/** Absolute path to the skills config JSON (config/skills.json). */
export const SKILLS_CONFIG_PATH = SKILLS_CONFIG_PATH;
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
export const PORT = parseIntOrDefault(process.env.PORT, parseIntOrDefault(SERVER_DEFAULTS.port, 3456));
export const WORKSPACE_ALLOWED_ROOT = path.resolve(os.homedir());

let currentWorkspaceCwd = resolveWorkspaceCwd();

/** Config key for sidebar refresh interval. */
export const SIDEBAR_REFRESH_INTERVAL_MS =
  parseIntOrDefault(process.env.SIDEBAR_REFRESH_INTERVAL_MS, parseIntOrDefault(SERVER_DEFAULTS.sidebarRefreshIntervalMs, 3000));

/** Config key for default permission mode. */
export const DEFAULT_PERMISSION_MODE = process.env.DEFAULT_PERMISSION_MODE || DEFAULT_PERMISSION_MODE_FROM_CONFIG;

/** Validate default provider. */
const rawDefaultProvider = typeof process.env.DEFAULT_PROVIDER === "string" ? process.env.DEFAULT_PROVIDER.toLowerCase() : "";
export const DEFAULT_PROVIDER =
  ["claude", "gemini", "codex"].includes(rawDefaultProvider)
    ? rawDefaultProvider
    : DEFAULT_PROVIDER_FROM_CONFIG;

/** Log directory for AI provider output. */
const AI_LOG_ROOT = asStringSafe(SERVER_DEFAULTS?.logsDirName, "logs");
const AI_LOG_DIR = process.env.CLAUDE_OUTPUT_LOG
  ? path.resolve(process.env.CLAUDE_OUTPUT_LOG)
  : path.join(projectRoot, AI_LOG_ROOT);

function asStringSafe(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function resolveLogDir() {
  try {
    const stat = fs.statSync(AI_LOG_DIR);
    return stat.isDirectory() ? AI_LOG_DIR : path.dirname(AI_LOG_DIR);
  } catch {
    return path.join(projectRoot, asStringSafe(SERVER_DEFAULTS?.logsDirName, "logs"));
  }
}

/** Run-specific directory used for LLM input/output logs. */
const LOG_DIR = resolveLogDir();

// Run timestamp for logs
const LOG_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** Base directory for LLM CLI input/output debug logs. */
export const LLM_CLI_IO_LOG_DIR = path.join(LOG_DIR, asStringSafe(SERVER_DEFAULTS?.llmCliIoSubdir, "llm-cli-input-output"));
/** Run-specific directory: llm-cli-input-output/{timestamp}. */
export const LLM_CLI_IO_RUN_DIR = path.join(LLM_CLI_IO_LOG_DIR, LOG_TIMESTAMP);

export function ensureLlmCliIoRunDir() {
  try {
    if (!fs.existsSync(LLM_CLI_IO_RUN_DIR)) {
      fs.mkdirSync(LLM_CLI_IO_RUN_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[llm-cli-io] Failed to create run dir:", err?.message);
  }
}

export function getLlmCliIoTurnPaths(provider, sessionId, turnId) {
  const sessionDir = path.join(LLM_CLI_IO_RUN_DIR, `${provider}-${sessionId}`);
  const turnDir = path.join(sessionDir, String(turnId));
  try {
    fs.mkdirSync(turnDir, { recursive: true });
  } catch (err) {
    console.warn("[llm-cli-io] Failed to create turn dir:", err?.message);
  }
  return {
    inputPath: path.join(turnDir, "input.log"),
    outputPath: path.join(turnDir, "output.log"),
    turnDir,
  };
}

// PI + session/runtime settings
export const PI_CLI_PATH = process.env.PI_CLI_PATH || asStringSafe(PI_DEFAULTS?.cliPath, asStringSafe(SERVER_DEFAULTS?.pi?.cliPath, "pi"));
export const SESSIONS_ROOT = path.join(projectRoot, asStringSafe(DEFAULT_SESSION_CONFIG?.agentDir, path.join(".pi", "agent")));

// Docker flag
export const ENABLE_DOCKER_MANAGER = process.env.ENABLE_DOCKER_MANAGER === "1" || process.env.ENABLE_DOCKER_MANAGER === "true";

// Tunnel/proxy settings
export const TUNNEL_PROXY_PORT = parseIntOrDefault(process.env.PROXY_PORT, parseIntOrDefault(DEFAULT_PROXY_CONFIG.port, 9443));
export const PROXY_DEFAULT_TARGET_PORT = parseIntOrDefault(
  process.env.PROXY_DEFAULT_TARGET_PORT,
  parseIntOrDefault(process.env.PORT, parseIntOrDefault(DEFAULT_PROXY_CONFIG.defaultTargetPort, PORT)),
);
export const PROXY_BIND_HOST = asStringSafe(process.env.PROXY_BIND, asStringSafe(DEFAULT_PROXY_CONFIG.bindHost, "0.0.0.0"));
export const PROXY_LOOPBACK_HOST = asStringSafe(DEFAULT_PROXY_CONFIG.loopbackHost, "127.0.0.1");
export const PROXY_DEFAULT_TARGET_HOST = asStringSafe(DEFAULT_PROXY_CONFIG.defaultTargetHost, "localhost");
export const DEFAULT_SERVER_HOST = asStringSafe(SERVER_DEFAULTS.logHost, "localhost");
export const SERVER_LISTEN_HOST = asStringSafe(SERVER_DEFAULTS.listenHost, "0.0.0.0");
export const DEFAULT_SSE_HOST = asStringSafe(SERVER_DEFAULTS.sseHost, `${PROXY_DEFAULT_TARGET_HOST}:${PORT}`);
export const DEFAULT_SERVER_URL = `${asStringSafe(SERVER_DEFAULTS.mobile?.defaultServerUrl, "http://localhost:3456")}`;
export const DEFAULT_TUNNEL_PROXY_PORT = parseIntOrDefault(DEFAULT_MOBILE_CONFIG.tunnelProxyPort, parseIntOrDefault(DEFAULT_PROXY_CONFIG.port, 9443));
export const ANDROID_EMULATOR_HOST = asStringSafe(DEFAULT_MOBILE_CONFIG.androidEmulatorHost, "10.0.2.2");
export const MOBILE_LOCALHOST_ALIASES = Array.isArray(DEFAULT_MOBILE_CONFIG.localhostAliases)
  ? DEFAULT_MOBILE_CONFIG.localhostAliases
  : LOOPBACK_HOSTS;
export const CLOUDFLARE_TUNNEL_TARGET_TEMPLATE = `http://${PROXY_LOOPBACK_HOST}:${TUNNEL_PROXY_PORT}`;
export const SMOKE_SCRIPT_DEFAULTS = asObject(DEFAULT_SCRIPTS.smokeSessionSwitch);
export const LOAD_TEST_SCRIPT_DEFAULTS = asObject(DEFAULT_SCRIPTS.loadTestCodex);

// Workspace mutable reference
export function getWorkspaceCwd() {
  return currentWorkspaceCwd;
}

export function setWorkspaceCwd(newPath) {
  if (typeof newPath !== "string" || !newPath.trim()) {
    return { ok: false, error: "Path is required" };
  }
  const resolved = path.resolve(newPath);
  if (!resolved.startsWith(WORKSPACE_ALLOWED_ROOT)) {
    return { ok: false, error: `Path must be under ${WORKSPACE_ALLOWED_ROOT}` };
  }
  try {
    if (!fs.existsSync(resolved)) return { ok: false, error: "Path does not exist" };
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return { ok: false, error: "Path is not a directory" };
  } catch (err) {
    return { ok: false, error: err.message || "Invalid path" };
  }
  currentWorkspaceCwd = resolved;
  return { ok: true };
}

// Export project paths
export { projectRoot, __dirname };
