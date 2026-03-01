/**
 * Docker API routes (when ENABLE_DOCKER_MANAGER is set).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { ENABLE_DOCKER_MANAGER, projectRoot } from "../config/index.js";

function dockerUnavailableStatus(err) {
  return err?.message?.includes("not available") ? 503 : 500;
}

export async function registerDockerRoutes(app) {
  app.get("/api/docker/status", (_, res) => {
    res.json({ enabled: !!ENABLE_DOCKER_MANAGER });
  });

  if (!ENABLE_DOCKER_MANAGER) return;

  const dockerMod = await import("../docker/index.js");
  const {
    listContainers,
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,
    getContainerLogs,
    listImages,
    removeImage,
    pruneImages,
    listVolumes,
    removeVolume,
    pruneVolumes,
    buildDiagnostic,
  } = dockerMod;
  const publicDir = path.join(projectRoot, "public");

  const handleAction = (actionFn, defaultError) => async (req, res) => {
    try {
      const result = await actionFn(req, res);
      res.json(result ?? { ok: true });
    } catch (error) {
      res.status(dockerUnavailableStatus(error)).json({ error: error?.message || defaultError });
    }
  };

  app.get("/api/docker/diagnostic", async (_, res) => {
    const diag = await buildDiagnostic(ENABLE_DOCKER_MANAGER);
    res.json(diag);
  });

  app.get("/docker", (_, res) => {
    res.sendFile(path.join(publicDir, "docker.html"));
  });

  app.get("/docker.js", (_, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.join(publicDir, "docker.js"));
  });

  app.get("/api/docker/containers", handleAction(
    async (req) => ({ containers: await listContainers({ all: req.query.all === "true" }) }),
    "Failed to list containers"
  ));

  app.post("/api/docker/containers/:id/start", handleAction(
    async (req) => { await startContainer(req.params.id); },
    "Failed to start container"
  ));

  app.post("/api/docker/containers/:id/stop", handleAction(
    async (req) => { await stopContainer(req.params.id); },
    "Failed to stop container"
  ));

  app.post("/api/docker/containers/:id/restart", handleAction(
    async (req) => { await restartContainer(req.params.id); },
    "Failed to restart container"
  ));

  app.delete("/api/docker/containers/:id", handleAction(
    async (req) => { await removeContainer(req.params.id, { force: req.query.force === "true" }); },
    "Failed to remove container"
  ));

  app.get("/api/docker/containers/:id/logs", handleAction(
    async (req) => {
      const tail = req.query.tail ? parseInt(req.query.tail, 10) : 500;
      const opts = Number.isFinite(tail) && tail > 0 ? { tail } : {};
      return await getContainerLogs(req.params.id, opts);
    },
    "Failed to get logs"
  ));

  app.get("/api/docker/images", handleAction(
    async () => ({ images: await listImages() }),
    "Failed to list images"
  ));

  app.post("/api/docker/images/prune", handleAction(
    async (req) => await pruneImages({ filters: req.body?.filters || {} }),
    "Failed to prune images"
  ));

  app.delete("/api/docker/images/:id", handleAction(
    async (req) => { await removeImage(req.params.id, { force: req.query.force === "true" }); },
    "Failed to remove image"
  ));

  app.get("/api/docker/volumes", handleAction(
    async () => ({ volumes: await listVolumes() }),
    "Failed to list volumes"
  ));

  app.post("/api/docker/volumes/prune", handleAction(
    async () => await pruneVolumes(),
    "Failed to prune volumes"
  ));

  app.delete("/api/docker/volumes/:name", handleAction(
    async (req) => { await removeVolume(req.params.name); },
    "Failed to remove volume"
  ));
}
