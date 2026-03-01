/**
 * Config and workspace path routes.
 */
import os from "os";
import {
  ENABLE_DOCKER_MANAGER, getWorkspaceCwd,
  loadModelsConfig,
  setWorkspaceCwd, SIDEBAR_REFRESH_INTERVAL_MS, WORKSPACE_ALLOWED_ROOT
} from "../config/index.js";

function toMb(value) {
  return typeof value === "number" ? Number((value / (1024 * 1024)).toFixed(1)) : 0;
}

export function registerConfigRoutes(app) {
  app.get("/api/config", (_, res) => {
    res.json({
      sidebarRefreshIntervalMs: SIDEBAR_REFRESH_INTERVAL_MS,
    });
  });

  /**
   * GET /api/models
   * Returns the full model configuration from config/models.json.
   * Re-reads from disk on every request so edits take effect without restart.
   */
  app.get("/api/models", (_, res) => {
    const modelsConfig = loadModelsConfig();
    res.json(modelsConfig);
  });

  app.get("/api/workspace-path", (_, res) => {
    const cwd = getWorkspaceCwd();
    res.json({
      path: cwd,
      allowedRoot: WORKSPACE_ALLOWED_ROOT,
    });
  });

  app.get("/api/health", (_, res) => {
    const memory = process.memoryUsage();
    const loadAvg = os.loadavg?.() ?? [];
    res.json({
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        loadAvg: loadAvg,
        memory: {
          rss: toMb(memory.rss),
          heapTotal: toMb(memory.heapTotal),
          heapUsed: toMb(memory.heapUsed),
          external: toMb(memory.external),
          arrayBuffers: toMb(memory.arrayBuffers),
        },
      },
      workspace: {
        path: getWorkspaceCwd(),
        allowedRoot: WORKSPACE_ALLOWED_ROOT,
      },
      dockerEnabled: !!ENABLE_DOCKER_MANAGER,
    });
  });

  app.post("/api/workspace-path", (req, res) => {
    const rawPath = req.body?.path ?? req.query?.path;
    const result = setWorkspaceCwd(rawPath);
    if (result.ok) {
      res.json({ path: getWorkspaceCwd() });
    } else {
      res.status(400).json({ error: result.error });
    }
  });
}
