/**
 * Express routes for the server.
 *
 * Orchestrates all HTTP endpoints:
 * - Config and workspace path
 * - Skills discovery and management
 * - Workspace file tree, content, preview
 * - Git operations
 * - Process discovery and logs
 * - Docker API (when enabled)
 */
import { registerConfigRoutes } from "./config.js";
import { registerDockerRoutes } from "./docker.js";
import { registerGitRoutes } from "./git.js";
import { registerHealthPageRoutes } from "./healthPage.js";
import { registerPortRoutes } from "./ports.js";
import { registerProcessesRoutes } from "./processes.js";
import { registerSessionManagementStoreRoutes } from "./sessionManagementStore.js";
import { registerSessionsRoutes } from "./sessions.js";
import { registerSkillsRoutes } from "./skills.js";
import { createServeWorkspaceFileMiddleware, registerWorkspaceRoutes } from "./workspace.js";

/**
 * Configure all Express routes on the given app instance.
 * @param {import('express').Application} app - Express application
 */
export async function setupRoutes(app) {
  app.use(apiLoggingMiddleware);

  registerConfigRoutes(app);
  registerPortRoutes(app);
  registerSessionsRoutes(app);
  registerSkillsRoutes(app);
  registerWorkspaceRoutes(app);
  registerGitRoutes(app);
  registerProcessesRoutes(app);
  await registerDockerRoutes(app);
  registerHealthPageRoutes(app);
  registerSessionManagementStoreRoutes(app);

  const serveWorkspaceFile = createServeWorkspaceFileMiddleware();
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    serveWorkspaceFile(req, res, next);
  });
}

function apiLoggingMiddleware(req, res, next) {
  if (req.path.startsWith("/api/")) {
    const ts = new Date().toISOString();
    console.log(`[API] ${ts} ${req.method} ${req.path}`, req.query && Object.keys(req.query).length ? req.query : "");
    res.on("finish", () => {
      console.log(`[API] ${ts} ${req.method} ${req.path} -> ${res.statusCode}`);
    });
  }
  next();
}
