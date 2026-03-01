/**
 * Pi agent skills discovery and loading.
 *
 * Scans the skills/ folder for SKILL.md files, parses frontmatter,
 * and loads enabled skill content for prompt injection.
 */
import fs from "fs";
import path from "path";
import { projectRoot, loadSkillsConfig } from "../config/index.js";

/** Load skill config values from config/skills.json (with fallbacks). */
function getSkillsConfigValues() {
  const cfg = loadSkillsConfig();
  return {
    skillFile: cfg.skillFileName,
    enabledFilePath: path.join(projectRoot, cfg.skillsEnabledFile),
    defaultCategory: cfg.defaultCategory,
    categories: cfg.categories || {},
  };
}

function getSkillCategory(id) {
  const { categories, defaultCategory } = getSkillsConfigValues();
  return categories[id] || defaultCategory;
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Extracts name and description between first --- pair.
 * @param {string} content - Full file content
 * @returns {{ name?: string; description?: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const block = match[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const descMatch = block.match(/^description:\s*(.+)$/m);

  const name = nameMatch?.[1]?.trim()?.replace(/^["']|["']$/g, "") ?? undefined;
  const description = descMatch?.[1]?.trim()?.replace(/^["']|["']$/g, "") ?? undefined;

  return { name, description };
}

/**
 * Discover all skills in the skills directory.
 * @param {string} skillsDir - Absolute path to skills/
 * @returns {{ skills: Array<{ id: string; name: string; description: string }> }}
 */
export function discoverSkills(skillsDir) {
  const skills = [];

  if (!skillsDir || !fs.existsSync(skillsDir)) {
    return { skills };
  }

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;

      const skillPath = path.join(skillsDir, ent.name);
      const skillFile = path.join(skillPath, getSkillsConfigValues().skillFile);
      if (!fs.existsSync(skillFile) || !fs.statSync(skillFile).isFile()) continue;

      try {
        const content = fs.readFileSync(skillFile, "utf8");
        const { name, description } = parseFrontmatter(content);
        skills.push({
          id: ent.name,
          name: name ?? ent.name,
          description: description ?? "",
          category: getSkillCategory(ent.name),
        });
      } catch (err) {
        console.warn("[skills] Failed to parse", skillFile, err?.message);
      }
    }
  } catch (err) {
    console.warn("[skills] Failed to scan", skillsDir, err?.message);
  }

  return { skills };
}

/**
 * Get full skill content (SKILL.md) for a single skill by id or name.
 * First tries exact id (folder name), then falls back to matching by display name.
 * @param {string} id - Skill id (directory name) or name (from frontmatter)
 * @param {string} skillsDir - Absolute path to skills/
 * @returns {{ id: string; name: string; description: string; content: string; children: Array } | null}
 */
export function getSkillContent(id, skillsDir) {
  if (!skillsDir || !fs.existsSync(skillsDir) || !id || typeof id !== "string") {
    return null;
  }
  const skillRoot = path.resolve(skillsDir);
  const idClean = id.trim();
  let subdir = path.basename(idClean.replace(/[/\\]/g, ""));
  const SKILL_FILE_NAME = getSkillsConfigValues().skillFile;
  let skillPath = path.join(skillRoot, subdir, SKILL_FILE_NAME);

  if (!skillPath.startsWith(skillRoot) || !fs.existsSync(skillPath) || !fs.statSync(skillPath).isFile()) {
    const { skills } = discoverSkills(skillsDir);
    const match = skills.find(
      (s) =>
        s.id === idClean ||
        s.id === subdir ||
        s.name === idClean ||
        (s.name && s.name.toLowerCase() === idClean.toLowerCase()) ||
        (s.id && s.id.toLowerCase() === idClean.toLowerCase())
    );
    if (match) {
      subdir = match.id;
      skillPath = path.join(skillRoot, subdir, SKILL_FILE_NAME);
    }
  }

  if (!skillPath.startsWith(skillRoot) || !fs.existsSync(skillPath) || !fs.statSync(skillPath).isFile()) {
    return null;
  }

  try {
    const content = fs.readFileSync(skillPath, "utf8").trim();
    const { name, description } = parseFrontmatter(content);

    const skillDir = path.dirname(skillPath);
    const children = [];
    if (fs.existsSync(skillDir) && fs.statSync(skillDir).isDirectory()) {
      const entries = fs.readdirSync(skillDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        children.push({
          name: ent.name,
          type: ent.isDirectory() ? "directory" : "file",
        });
      }
      children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    return {
      id: subdir,
      name: name ?? subdir,
      description: description ?? "",
      content,
      children,
    };
  } catch (err) {
    console.warn("[skills] Failed to read", skillPath, err?.message);
    return null;
  }
}

/**
 * Get children of a subfolder within a skill. Used for expandable folder trees.
 * @param {string} skillId - Skill id (directory name)
 * @param {string} relativePath - Path relative to skill root, e.g. "data" or "data/stacks"
 * @param {string} skillsDir - Absolute path to skills/
 * @returns {{ children: Array<{ name: string; type: "directory" | "file" }> } | null}
 */
export function getSkillChildren(skillId, relativePath, skillsDir) {
  if (!skillsDir || !fs.existsSync(skillsDir) || !skillId || typeof skillId !== "string") {
    return null;
  }
  const skillRoot = path.resolve(skillsDir);
  const idClean = skillId.trim().replace(/[/\\]/g, "");
  const safePath = (relativePath || "")
    .split(/[/\\]+/)
    .filter((p) => p && p !== "." && p !== "..")
    .join(path.sep);
  const targetDir = path.join(skillRoot, idClean, safePath);

  if (!targetDir.startsWith(path.join(skillRoot, idClean)) || !fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return null;
  }

  try {
    const children = [];
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      children.push({
        name: ent.name,
        type: ent.isDirectory() ? "directory" : "file",
      });
    }
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { children };
  } catch (err) {
    console.warn("[skills] Failed to read children", targetDir, err?.message);
    return null;
  }
}

/**
 * Resolve agent directory (workspace .pi/agent first, then project .pi/agent).
 * Uses same logic as piRpcSession for auth; for skills we fall back to project .pi/agent if needed.
 * @param {string} workspaceCwd - Current workspace path
 * @param {string} projectRoot - Project root path
 * @returns {string | null}
 */
export function resolveAgentDir(workspaceCwd, projectRoot) {
  const workspaceAgentDir = path.join(workspaceCwd, ".pi", "agent");
  const workspaceAuthPath = path.join(workspaceAgentDir, "auth.json");
  const projectAgentDir = projectRoot ? path.join(projectRoot, ".pi", "agent") : null;

  if (fs.existsSync(workspaceAuthPath)) return workspaceAgentDir;
  if (projectAgentDir && fs.existsSync(path.join(projectAgentDir, "auth.json"))) return projectAgentDir;
  if (fs.existsSync(workspaceAgentDir)) return workspaceAgentDir;
  if (projectAgentDir && fs.existsSync(projectAgentDir)) return projectAgentDir;
  if (projectAgentDir) return projectAgentDir;

  return null;
}

/**
 * Get enabled skill IDs from persistence.
 * @param {string} agentDir - Resolved agent directory (ignored, stored globally now)
 * @returns {string[]}
 */
export function getEnabledIds(agentDir) {
  try {
    const enabledFile = getSkillsConfigValues().enabledFilePath;
    if (!fs.existsSync(enabledFile)) return [];
    const data = JSON.parse(fs.readFileSync(enabledFile, "utf8"));
    const ids = data?.enabledIds;
    const filtered = Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && x) : [];
    return [...new Set(filtered)]; // Deduplicate to prevent same skill loading twice
  } catch (err) {
    console.warn("[skills] Failed to read enabled skills file:", err?.message);
    return [];
  }
}

/**
 * Set enabled skill IDs in persistence.
 * @param {string} agentDir - Resolved agent directory (ignored, stored globally now)
 * @param {string[]} enabledIds - List of skill IDs to enable
 * @returns {{ ok: boolean; error?: string }}
 */
export function setEnabledIds(agentDir, enabledIds) {
  const normalized = Array.isArray(enabledIds)
    ? enabledIds.filter((x) => typeof x === "string" && x.trim())
    : [];

  try {
    const enabledFile = getSkillsConfigValues().enabledFilePath;
    fs.mkdirSync(path.dirname(enabledFile), { recursive: true });
    fs.writeFileSync(enabledFile, JSON.stringify({ enabledIds: normalized }, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    console.warn("[skills] Failed to write enabled skills file:", err?.message);
    return { ok: false, error: err?.message ?? "Failed to save" };
  }
}

/**
 * Sync a folder with symlinks to only the enabled skills. Used for Pi --skill loading.
 * Creates targetDir/id -> skillsDir/id for each enabled skill that exists.
 * @param {string} skillsDir - Absolute path to skills/ (from /api/skills)
 * @param {string} agentDir - Resolved agent directory (for getEnabledIds)
 * @param {string} targetDir - Where to create symlinks, e.g. workspaceCwd/.pi/skills-enabled
 * @returns {string[]} Absolute paths to each enabled skill (for --skill flags)
 */
export function syncEnabledSkillsFolder(skillsDir, agentDir, targetDir) {
  const enabledIds = getEnabledIds(agentDir);
  if (enabledIds.length === 0) return [];

  const skillRoot = path.resolve(skillsDir);
  const paths = [];

  try {
    if (fs.existsSync(targetDir)) {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.name.startsWith(".")) {
          const p = path.join(targetDir, ent.name);
          try {
            fs.unlinkSync(p); // symlinks are removed with unlink
          } catch (_) { }
          try {
            fs.rmSync(p, { recursive: true, force: true });
          } catch (_) { }
        }
      }
    } else {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    for (const id of enabledIds) {
      if (!id || typeof id !== "string") continue;
      const subdir = path.basename(id);
      const srcPath = path.join(skillRoot, subdir);
      const skillFile = path.join(srcPath, getSkillsConfigValues().skillFile);
      if (!srcPath.startsWith(skillRoot) || !fs.existsSync(skillFile) || !fs.statSync(skillFile).isFile()) continue;

      const linkPath = path.join(targetDir, subdir);
      try {
        fs.symlinkSync(srcPath, linkPath, "dir");
      } catch (err) {
        console.warn("[skills] Failed to symlink", subdir, err?.message);
        continue;
      }
      paths.push(linkPath);
    }
  } catch (err) {
    console.warn("[skills] Failed to sync enabled-skills folder:", err?.message);
  }

  return paths;
}
