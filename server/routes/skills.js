/**
 * Skills discovery and management routes.
 */
import path from "path";
import { projectRoot, loadSkillsConfig } from "../config/index.js";
import {
  discoverSkills, getEnabledIds, getSkillChildren, getSkillContent, setEnabledIds
} from "../skills/index.js";

/** Resolve skills directory from config/skills.json. */
function getSkillsDir() {
  const skillsConfig = loadSkillsConfig();
  return path.join(projectRoot, skillsConfig.skillsLibraryDir);
}

export function registerSkillsRoutes(app) {
  app.get("/api/skills", (_, res) => {
    try {
      const data = discoverSkills(getSkillsDir());
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to list skills" });
    }
  });

  app.get("/api/skills/:id/children", (req, res) => {
    const id = req.params?.id;
    const relPath = typeof req.query?.path === "string" ? req.query.path : "";
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid skill id" });
    }
    try {
      const data = getSkillChildren(id, relPath, getSkillsDir());
      if (!data) {
        return res.status(404).json({ error: "Path not found" });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load children" });
    }
  });

  app.get("/api/skills/:id", (req, res) => {
    const id = req.params?.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid skill id" });
    }
    try {
      const data = getSkillContent(id, getSkillsDir());
      if (!data) {
        return res.status(404).json({ error: "Skill not found" });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load skill" });
    }
  });

  app.get("/api/skills-enabled", (_, res) => {
    try {
      const enabledIds = getEnabledIds();
      res.json({ enabledIds });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to get enabled skills" });
    }
  });

  app.post("/api/skills-enabled", (req, res) => {
    try {
      const enabledIds = Array.isArray(req.body?.enabledIds) ? req.body.enabledIds : [];
      const result = setEnabledIds(enabledIds);
      if (result.ok) {
        res.json({ enabledIds: getEnabledIds() });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to update enabled skills" });
    }
  });
}
