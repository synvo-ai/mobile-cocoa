/**
 * Process discovery utilities.
 * Finds processes listening on common dev ports and retrieves their command lines.
 * Extracts log file paths from commands (>> file.log, > file.log) for the "View log" feature.
 */
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { PORT, TUNNEL_PROXY_PORT } from "../config/index.js";

/** Common development server ports to scan. */
const COMMON_DEV_PORTS = [3000, 3456, 4000, 5000, 5173, 8000, 8080, 3001, 4001];

/**
 * Ports belonging to this application's own infrastructure.
 * Processes on these ports are marked `protected: true` — they cannot be killed
 * or have logs read via the API to prevent accidental self-destruction.
 */
const PROTECTED_PORTS = new Set([Number(PORT), Number(TUNNEL_PROXY_PORT)]);

/** Set of PIDs currently known to be on protected ports. Updated on each scan. */
let protectedPids = new Set();

function isInsideRoot(rootDir, targetPath) {
  const rel = path.relative(rootDir, targetPath);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

/** Check whether a PID belongs to a protected process. */
export function isProtectedPid(pid) {
  return protectedPids.has(Number(pid));
}

/**
 * Get log file paths from process's stdout/stderr (fd 1, 2) via lsof.
 * Works for nohup-started processes where the child inherits redirects.
 *
 * @param {number} pid - Process ID
 * @returns {string[]} Absolute paths to log files (unique)
 */
function getLogFilesFromProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || process.platform === "win32") return [];
  const paths = new Set();
  try {
    const lsofOutput = execSync(`lsof -p ${pid} -a -d 1,2 2>/dev/null || true`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024,
    });
    const lines = lsofOutput.trim().split("\n").slice(1);
    for (const line of lines) {
      const pathStartIndex = line.indexOf("/");
      if (pathStartIndex < 0) continue;
      const filePath = line.slice(pathStartIndex).trim();
      if (!filePath || filePath.startsWith("/dev/")) continue;
      if (filePath.includes("/") && filePath.length > 1) paths.add(filePath);
    }
  } catch (_) { }
  if (paths.size > 0) return [...paths];
  try {
    for (let depth = 0; depth < 3; depth++) {
      const parentPidOutput = execSync(`ps -p ${pid} -o ppid= 2>/dev/null || true`, { encoding: "utf8" }).trim();
      const parentPid = parentPidOutput ? parseInt(parentPidOutput, 10) : 0;
      if (!parentPid || parentPid <= 0) break;
      let parentCommand = "";
      try {
        parentCommand = execSync(`ps -p ${parentPid} -o args= 2>/dev/null || ps -p ${parentPid} -o command= 2>/dev/null || echo ""`, {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
          maxBuffer: 32 * 1024,
        }).trim();
      } catch (_) { }
      const logPathsFromParentCommand = extractLogPathsFromCommand(parentCommand);
      if (logPathsFromParentCommand.length > 0) return logPathsFromParentCommand;
      const logPathsFromParentLsof = (() => {
        try {
          const parentLsofOutput = execSync(`lsof -p ${parentPid} -a -d 1,2 2>/dev/null || true`, { encoding: "utf8" });
          const found = new Set();
          for (const line of parentLsofOutput.trim().split("\n").slice(1)) {
            const pathStartIndex = line.indexOf("/");
            if (pathStartIndex < 0) continue;
            const filePath = line.slice(pathStartIndex).trim();
            if (filePath && !filePath.startsWith("/dev/")) found.add(filePath);
          }
          return [...found];
        } catch (_) {
          return [];
        }
      })();
      if (logPathsFromParentLsof.length > 0) return logPathsFromParentLsof;
      pid = parentPid;
    }
  } catch (_) { }
  return [];
}

/**
 * Extract log file paths from a shell command.
 * Matches patterns: >> backend.log, > abc.log, 2>> error.log.
 * Excludes 2>&1 (stderr to stdout) by requiring path to end with .log, .out, or .err.
 *
 * @param {string} cmd - Full command string
 * @returns {string[]} Unique log filenames (e.g. ["backend.log", "frontend.log"])
 */
function extractLogPathsFromCommand(cmd) {
  if (!cmd || typeof cmd !== "string") return [];
  const matches = new Set();
  const logRedirectionPattern = /(?:>>|(?<![0-9])>)\s+([a-zA-Z0-9_.\-/]+\.(?:log|out|err))/gi;
  let match;
  while ((match = logRedirectionPattern.exec(cmd)) !== null) {
    const logPath = match[1]?.trim();
    if (logPath) matches.add(logPath);
  }
  return [...matches];
}

/**
 * List processes listening on common dev ports.
 * Uses lsof to find PIDs, then ps to get command lines.
 * Cross-platform: uses lsof/ps (macOS/Linux). Windows would need different logic.
 *
 * @param {string} [workspacePath] - Optional workspace path (unused for port scan; reserved for future filtering)
 * @returns {{ pid: number; port: number; command: string }[]}
 */
export function listProcessesOnPorts(workspacePath) {
  const results = [];
  const seenPids = new Set();
  const nextProtectedPids = new Set();

  if (process.platform === "win32") {
    return results;
  }

  for (const port of COMMON_DEV_PORTS) {
    const isProtectedPort = PROTECTED_PORTS.has(port);
    try {
      const pidOut = execSync(`lsof -ti :${port} 2>/dev/null || true`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 64 * 1024,
      }).trim();

      const pids = pidOut ? pidOut.split(/\s+/).filter(Boolean).map(Number) : [];
      for (const pid of pids) {
        if (!Number.isInteger(pid) || pid <= 0 || seenPids.has(pid)) continue;
        seenPids.add(pid);
        if (isProtectedPort) nextProtectedPids.add(pid);
        let command = "";
        try {
          command = execSync(`ps -p ${pid} -o args= 2>/dev/null || ps -p ${pid} -o command= 2>/dev/null || echo ""`, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 32 * 1024,
          }).trim();
        } catch (_) {
          command = "(unknown)";
        }
        const cmd = command || "(unknown)";
        let logPaths = isProtectedPort ? [] : getLogFilesFromProcess(pid);
        if (logPaths.length === 0 && !isProtectedPort) {
          logPaths = extractLogPathsFromCommand(cmd);
        }
        if (logPaths.length > 0 && workspacePath) {
          const workspaceNorm = path.resolve(workspacePath).replace(/\/$/, "") + path.sep;
          logPaths = [...new Set(logPaths)]
            .map((logPath) => {
              if (!logPath.startsWith("/")) return logPath;
              const resolved = path.resolve(logPath);
              if (resolved.startsWith(workspaceNorm)) {
                return path.relative(workspaceNorm.slice(0, -1), resolved);
              }
              return logPath;
            })
            .filter(Boolean);
        }
        results.push({ pid, port, command: cmd, logPaths, protected: isProtectedPort });
      }
    } catch (_) {
      // Port scan failed for this port, skip
    }
  }

  // Update the global set so killProcess / handleLogTail can check
  protectedPids = nextProtectedPids;

  return results;
}

/**
 * Kill a process by PID.
 * Uses SIGTERM by default; SIGKILL on Windows.
 *
 * @param {number} pid - Process ID
 * @returns {{ ok: boolean; error?: string }}
 */
export function killProcess(pid) {
  const pidNumber = parseInt(pid, 10);
  if (!Number.isInteger(pidNumber) || pidNumber <= 0) {
    return { ok: false, error: "Invalid PID" };
  }
  if (isProtectedPid(pidNumber)) {
    return { ok: false, error: "Cannot kill a protected system process" };
  }
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pidNumber} /F`, { stdio: "ignore" });
    } else {
      execSync(`kill -15 ${pidNumber} 2>/dev/null || kill -9 ${pidNumber} 2>/dev/null`, {
        stdio: "ignore",
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? "Failed to kill process" };
  }
}

const TAIL_LINES = 200;

/** Max depth to search for log files under workspace (e.g. apps/web/frontend.log). */
const FIND_LOG_MAX_DEPTH = 5;

/**
 * Find a log file under workspace by name (e.g. backend.log).
 * Searches workspace root and subdirs up to FIND_LOG_MAX_DEPTH levels.
 *
 * @param {string} workspacePath - Absolute workspace path
 * @param {string} name - Filename (e.g. backend.log)
 * @returns {string | null} Absolute path if found, else null
 */
function findLogFile(workspacePath, name) {
  if (!workspacePath || !name || typeof name !== "string") return null;
  const safeFileName = path.basename(name);
  if (!safeFileName || safeFileName.includes("..")) return null;
  const candidateAtRoot = path.join(workspacePath, safeFileName);
  if (fs.existsSync(candidateAtRoot) && fs.statSync(candidateAtRoot).isFile()) return candidateAtRoot;
  try {
    function search(dir, depth) {
      if (depth <= 0) return null;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const subPath = path.join(dir, entry.name, safeFileName);
        if (fs.existsSync(subPath) && fs.statSync(subPath).isFile()) return subPath;
        const found = search(path.join(dir, entry.name), depth - 1);
        if (found) return found;
      }
      return null;
    }
    return search(workspacePath, FIND_LOG_MAX_DEPTH);
  } catch (_) { }
  return null;
}

/**
 * Read last N lines of a log file (tail -n).
 *
 * @param {string} absPath - Absolute path to file (must be under workspace)
 * @param {string} workspacePath - Workspace root for validation
 * @param {number} lines - Number of lines
 * @returns {{ ok: boolean; content?: string; path?: string; error?: string }}
 */
export function getLogTail(absPath, workspacePath, lines = TAIL_LINES, allowOutside = false) {
  const resolved = path.resolve(absPath);
  if (!allowOutside) {
    const workspaceRoot = path.resolve(workspacePath);
    if (!isInsideRoot(workspaceRoot, resolved)) {
      return { ok: false, error: "Path outside workspace" };
    }
  }
  // Reject device files (e.g. /dev/console) — tail would block forever on them
  if (resolved.startsWith("/dev/")) {
    return { ok: false, error: "Cannot tail device files" };
  }
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { ok: false, error: "Not a regular file" };
    }
  } catch (_) {
    return { ok: false, error: "File not found or inaccessible" };
  }
  try {
    const result = spawnSync("tail", ["-n", String(lines), resolved], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 512 * 1024,
      timeout: 10_000, // Safety net — never block event loop for more than 10s
    });
    if (result.error) {
      return { ok: false, error: result.error.message || "Failed to read log" };
    }
    if (result.status !== 0) {
      const errText = (result.stderr || result.stdout || "Failed to read log").trim();
      return { ok: false, error: errText || "Failed to read log" };
    }
    return { ok: true, content: result.stdout ?? "", path: resolved };
  } catch (err) {
    return { ok: false, error: err?.message ?? "Failed to read log" };
  }
}

/**
 * Resolve log filename to absolute path and return tail.
 *
 * @param {string} workspacePath - Workspace root
 * @param {string} name - Filename (e.g. backend.log)
 * @param {number} lines - Number of lines
 * @returns {{ ok: boolean; content?: string; path?: string; error?: string }}
 */
export function getLogTailByName(workspacePath, name, lines = TAIL_LINES) {
  const found = findLogFile(workspacePath, name);
  if (!found) return { ok: false, error: `Log file not found: ${name}` };
  return getLogTail(found, workspacePath, lines);
}
