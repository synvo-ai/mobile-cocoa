import path from "path";
import { projectRoot } from "../config/index.js";

export function registerHealthPageRoutes(app) {
  const publicDir = path.join(projectRoot, "public");

  app.get("/health", (_, res) => {
    res.sendFile(path.join(publicDir, "health-check.html"));
  });

  app.get("/health-check", (_, res) => {
    res.sendFile(path.join(publicDir, "health-check.html"));
  });

  app.get("/health-check.js", (_, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.join(publicDir, "health-check.js"));
  });
}
