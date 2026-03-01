/**
 * Process discovery and management routes.
 */
import path from "path";
import { getWorkspaceCwd } from "../config/index.js";
import { resolveWithinRoot } from "../utils/index.js";
import { getLogTail, getLogTailByName, isProtectedPid, killProcess, listProcessesOnPorts } from "../utils/processes.js";

const LOG_LINES_MIN = 10;
const LOG_LINES_MAX = 500;
const LOG_LINES_DEFAULT = 200;

export function registerProcessesRoutes(app) {
  app.get("/api/processes", handleListProcesses);
  app.get("/api/processes/log", handleLogTail);
  app.post("/api/processes/:pid/kill", handleKillProcess);
}

function handleListProcesses(_, res) {
  try {
    const cwd = getWorkspaceCwd();
    const processes = listProcessesOnPorts(cwd);
    const withLogPaths = processes.map((processInfo) => ({ ...processInfo, logPaths: processInfo.logPaths ?? [] }));
    res.json({ processes: withLogPaths });
  } catch (error) {
    console.error("[api/processes]", error?.message ?? error);
    res.json({ processes: [], warning: error?.message ?? "Port scan failed" });
  }
}

function handleLogTail(req, res) {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  const relPath = typeof req.query.path === "string" ? req.query.path.trim() : "";
  const lines = Math.min(
    Math.max(parseInt(req.query.lines, 10) || LOG_LINES_DEFAULT, LOG_LINES_MIN),
    LOG_LINES_MAX
  );

  try {
    const cwd = getWorkspaceCwd();
    let result;
    if (relPath) {
      if (path.isAbsolute(relPath)) {
        result = getLogTail(relPath, cwd, lines, false);
      } else {
        const { ok, fullPath, error } = resolveWithinRoot(cwd, relPath);
        if (!ok || !fullPath) {
          return res.status(403).json({ error: error || "Path outside workspace" });
        }
        result = getLogTail(fullPath, cwd, lines);
      }
    } else if (name) {
      result = getLogTailByName(cwd, name, lines);
    } else {
      return res.status(400).json({ error: "Missing name or path" });
    }

    if (!result.ok) {
      return res.status(404).json({ error: result.error });
    }
    res.json({ content: result.content, path: result.path });
  } catch (error) {
    res.status(500).json({ error: error?.message ?? "Failed to read log" });
  }
}

function handleKillProcess(req, res) {
  const pid = req.params?.pid;
  if (!pid) {
    return res.status(400).json({ error: "Missing PID" });
  }
  if (isProtectedPid(pid)) {
    return res.status(403).json({ error: "Cannot kill a protected system process" });
  }
  const result = killProcess(pid);
  if (result.ok) {
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, error: result.error });
  }
}
