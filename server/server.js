/**
 * Main server entry point.
 * Refactored into modular architecture for better maintainability.
 */
import express from "express";
import { createServer } from "http";

import {
  DEFAULT_SERVER_HOST,
  ENABLE_DOCKER_MANAGER,
  PORT,
  SERVER_LISTEN_HOST,
  getWorkspaceCwd,
} from "./server/config/index.js";
import { shutdown } from "./server/process/index.js";
import { setupRoutes } from "./server/routes/index.js";
import { getActiveOverlay, getPreviewHost } from "./server/utils/index.js";

const app = express();
app.use(express.json());
const httpServer = createServer(app);

// Setup Express routes
await setupRoutes(app);

// Handle process signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));

httpServer.listen(PORT, SERVER_LISTEN_HOST, () => {
  const overlay = getActiveOverlay();
  const previewHost = getPreviewHost();
  const hostForLog = process.env.HOST || DEFAULT_SERVER_HOST;
  const baseUrl = `http://${hostForLog}:${PORT}`;

  console.log(`Terminal server at ${baseUrl}`);
  console.log(`Health check page: ${baseUrl}/health`);
  console.log(`Health check alias: ${baseUrl}/health-check`);
  console.log(`[Docker] ENABLE_DOCKER_MANAGER: ${ENABLE_DOCKER_MANAGER}`);
  console.log(`Overlay network: ${overlay}`);
  if (overlay === "tunnel") {
    console.log(`Tunnel preview host: ${previewHost}`);
    console.log(`Tunnel mode: traffic via dev proxy (e.g. Cloudflare Tunnel)`);
  } else {
    console.log(`Preview host: ${previewHost}`);
    console.log(`Listening on ${SERVER_LISTEN_HOST}`);
  }
  console.log(`Working directory: ${getWorkspaceCwd()}`);
});
