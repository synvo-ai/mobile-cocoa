/**
 * Server configuration and environment variables.
 * 
 * This module handles all server configuration including:
 * - Port configuration
 * - Workspace directory resolution (from CLI args or env vars)
 * - AI output logging paths
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get current directory and project root for path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

/**
 * Resolve workspace directory from CLI or environment variables.
 * Priority: --workspace flag > positional arg > WORKSPACE env > WORKSPACE_CWD env > default
 * @returns {string} Absolute path to workspace directory
 */
function resolveWorkspaceCwd() {
  const args = process.argv.slice(2);
  let fromCli = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    // Check for --workspace flag
    if (args[i] === "--workspace" && args[i + 1]) {
      fromCli = args[i + 1];
      break;
    }
    // Check for positional argument (first non-flag argument)
    if (!args[i].startsWith("-")) {
      fromCli = args[i];
      break;
    }
  }

  // Resolve final path with fallback chain.
  // Default to project root so sessions come from project-root/.pi only (not workspace_for_testing/.pi).
  const raw = fromCli ?? process.env.WORKSPACE ?? process.env.WORKSPACE_CWD ?? projectRoot;
  const resolved = path.resolve(raw);

  // Validate workspace path exists and is a directory
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

// Server port - can be overridden via PORT environment variable
export const PORT = process.env.PORT || 3456;

// Allowed workspace root for runtime switching (only paths under this are allowed)
export const WORKSPACE_ALLOWED_ROOT = path.resolve("/Users/yifanxu");

// Mutable workspace directory (can be changed via POST /api/workspace-path)
let currentWorkspaceCwd = resolveWorkspaceCwd();

/** Get current workspace directory. Used everywhere instead of static WORKSPACE_CWD. */
export function getWorkspaceCwd() {
  return currentWorkspaceCwd;
}

/**
 * Set workspace directory at runtime. Path must exist, be a directory, and be under WORKSPACE_ALLOWED_ROOT.
 * @param {string} newPath - Absolute or relative path
 * @returns {{ ok: boolean; error?: string }}
 */
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

// Workspace directory where Claude operates and files are served from (initial value; use getWorkspaceCwd() for current)
export const WORKSPACE_CWD = currentWorkspaceCwd;

// File tree refresh interval for sidebar (milliseconds)
export const SIDEBAR_REFRESH_INTERVAL_MS = parseInt(process.env.SIDEBAR_REFRESH_INTERVAL_MS || "3000", 10) || 3000;

// Default Claude permission mode (default, acceptEdits, bypassPermissions, etc.)
export const DEFAULT_PERMISSION_MODE = process.env.DEFAULT_PERMISSION_MODE || "bypassPermissions";

// AI provider: "claude", "gemini", or "codex" (defaults to codex provider in Pi mono mode).
const rawDefaultProvider = typeof process.env.DEFAULT_PROVIDER === "string" ? process.env.DEFAULT_PROVIDER.toLowerCase() : "";
export const DEFAULT_PROVIDER = ["claude", "gemini", "codex"].includes(rawDefaultProvider) ? rawDefaultProvider : "codex";

/**
 * Log directory for AI provider output.
 * Uses CLAUDE_OUTPUT_LOG env var if set, otherwise defaults to <project-root>/logs
 */
const AI_LOG_DIR = process.env.CLAUDE_OUTPUT_LOG
  ? path.resolve(process.env.CLAUDE_OUTPUT_LOG)
  : path.join(projectRoot, "logs");

/**
 * Resolve the log directory, creating it if necessary.
 * @returns {string} Absolute path to log directory
 */
function resolveLogDir() {
  let dir = path.join(projectRoot, "logs");
  try {
    const stat = fs.statSync(AI_LOG_DIR);
    dir = stat.isDirectory() ? AI_LOG_DIR : path.dirname(AI_LOG_DIR);
  } catch {
    dir = path.isAbsolute(AI_LOG_DIR) ? path.dirname(AI_LOG_DIR) : path.join(projectRoot, "logs");
  }
  return dir;
}

// Server-start timestamp shared by all log files in this run (YYYY-MM-DDTHH-MM-SS)
const LOG_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** Base directory for LLM CLI input/output debug logs. */
export const LLM_CLI_IO_LOG_DIR = path.join(resolveLogDir(), "llm-cli-input-output");

/** Run-specific directory: llm-cli-input-output/{timestamp}. Created on server start. */
export const LLM_CLI_IO_RUN_DIR = path.join(LLM_CLI_IO_LOG_DIR, LOG_TIMESTAMP);

/**
 * Ensure the run directory (timestamp folder) exists. Call on server start.
 */
export function ensureLlmCliIoRunDir() {
  try {
    if (!fs.existsSync(LLM_CLI_IO_RUN_DIR)) {
      fs.mkdirSync(LLM_CLI_IO_RUN_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[llm-cli-io] Failed to create run dir:", err?.message);
  }
}

/**
 * Get paths for a conversation turn's input.log and output.log.
 * Creates dirs: {run}/{provider}-{sessionId}/{turnId}/
 * @param {string} provider - provider name (e.g. "claude", "gemini", "codex")
 * @param {string} sessionId - session log dir name (e.g. yyyy-MM-dd_HH-mm-ss timestamp)
 * @param {string|number} turnId - conversation turn id
 * @returns {{ inputPath: string; outputPath: string; turnDir: string }}
 */
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

/**
 * DEPRECATED: Skills are now loaded from the workspace's ./skills directory.
 * See server/routes/skills.js and server/process/piRpcSession.js.
 */

/** Path to pi CLI binary. Defaults to "pi" (must be on PATH). */
export const PI_CLI_PATH = process.env.PI_CLI_PATH || "pi";

/**
 * Canonical sessions directory. All Pi sessions are stored here regardless of workspace.
 * Uses projectRoot/.pi/agent so sessions are independent of the selected workspace.
 */
export const SESSIONS_ROOT = path.join(projectRoot, ".pi", "agent");

/** Enable Docker manager page and API. Set to "1" or "true" to enable. */
export const ENABLE_DOCKER_MANAGER = process.env.ENABLE_DOCKER_MANAGER === "1" || process.env.ENABLE_DOCKER_MANAGER === "true";

// ── Tunnel / overlay configuration ─────────────────────────────────────────
// OVERLAY_NETWORK=tunnel when traffic reaches the server via the dev proxy (e.g. Cloudflare Tunnel).

/** Dev proxy port (for tunnel routing). */
export const TUNNEL_PROXY_PORT = parseInt(process.env.PROXY_PORT || "9443", 10);

/**
 * Whether overlay/tunnel mode is enabled (traffic via proxy with X-Target-Port routing).
 * @returns {"tunnel" | "none"}
 */
export function getOverlayNetwork() {
  const env = (process.env.OVERLAY_NETWORK || "").trim().toLowerCase();
  if (env === "tunnel") return "tunnel";
  if (env === "none") return "none";
  return "none";
}

// Export project paths for use in other modules
export { projectRoot, __dirname };
