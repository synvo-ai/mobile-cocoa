/**
 * Workspace file tree, content, and preview routes.
 */
import fs from "fs";
import path from "path";
import { getWorkspaceCwd, WORKSPACE_ALLOWED_ROOT } from "../config/index.js";
import {
  buildWorkspaceTree, getMimeForFile, IMAGE_EXT,
  isInsideRoot,
  MAX_TEXT_FILE_BYTES,
  normalizeRelativePath,
  resolveWithinRoot
} from "../utils/index.js";

const WORKSPACE_ALLOWED_ROOT_REAL = (() => {
  try {
    return fs.realpathSync(WORKSPACE_ALLOWED_ROOT);
  } catch {
    return path.resolve(WORKSPACE_ALLOWED_ROOT);
  }
})();

function isDisallowedPreviewPath(fullPath, baseDir) {
  const relative = path.relative(baseDir, fullPath);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    return true;
  }
  const disallowedSegments = new Set([".git", ".pi"]);
  return relative
    .split(path.sep)
    .filter(Boolean)
    .some((segment) => disallowedSegments.has(segment));
}

export function registerWorkspaceRoutes(app) {
  app.get("/api/workspace-allowed-children", handleWorkspaceAllowedChildren);
  app.get("/api/workspace-tree", handleWorkspaceTree);
  app.get("/api/preview-raw", handlePreviewRaw);
  app.get("/api/workspace-file", handleWorkspaceFile);
  app.post("/api/workspace/create-folder", handleWorkspaceCreateFolder);
}

function resolveWorkspaceContext(baseParam, rootParam, parentParam) {
  const base = baseParam === "os" ? "os" : "workspace";
  let rootDir;

  if (base === "os") {
    rootDir = path.resolve("/");
  } else if (typeof rootParam === "string" && rootParam.trim()) {
    rootDir = path.resolve(rootParam.trim());
    const resolvedRoot = (() => {
      try {
        return fs.realpathSync(rootDir);
      } catch {
        return null;
      }
    })();
    if (!resolvedRoot || !isInsideRoot(WORKSPACE_ALLOWED_ROOT_REAL, resolvedRoot)) {
      throw { status: 403, error: "Root must be under allowed workspace" };
    }
  } else {
    rootDir = getWorkspaceCwd();
  }

  let parent = typeof parentParam === "string"
    ? (() => {
      try {
        return normalizeRelativePath(parentParam);
      } catch (error) {
        throw { status: 400, error: error instanceof Error ? error.message : "Invalid path" };
      }
    })()
    : "";

  if (typeof parent !== "string") {
    throw { status: 400, error: "Invalid path" };
  }

  const { ok, fullPath: resolvedDir } = resolveWithinRoot(rootDir, parent);
  if (!ok || !resolvedDir) {
    throw { status: 403, error: "Path outside root" };
  }

  if (base !== "os" && !isInsideRoot(WORKSPACE_ALLOWED_ROOT_REAL, resolvedDir)) {
    throw { status: 403, error: "Path outside allowed workspace" };
  }

  return { base, rootDir, resolvedDir };
}

function handleWorkspaceCreateFolder(req, res) {
  try {
    const { resolvedDir } = resolveWorkspaceContext(req.body.base, req.body.root, req.body.parent);

    const { name } = req.body;
    if (typeof name !== "string" || !name.trim() || name.includes("/") || name.includes("\\") || name === ".." || name === ".") {
      return res.status(400).json({ error: "Invalid folder name" });
    }

    const targetFolder = path.join(resolvedDir, name);
    if (fs.existsSync(targetFolder)) {
      return res.status(400).json({ error: "Folder already exists" });
    }

    fs.mkdirSync(targetFolder, { recursive: true });
    res.json({ success: true, path: targetFolder });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.error });
    }
    res.status(500).json({ error: error.message || "Failed to create folder" });
  }
}

export function createServeWorkspaceFileMiddleware() {
  return function serveWorkspaceFile(req, res, next) {
    const rawPath = (req.path || "/").replace(/^\//, "") || "index.html";
    const cwd = getWorkspaceCwd();
    const { ok, fullPath } = resolveWithinRoot(cwd, rawPath);
    if (!ok || !fullPath) return next();
    if (isDisallowedPreviewPath(fullPath, cwd)) return next();

    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return next();

      res.setHeader("Content-Type", getMimeForFile(fullPath));
      res.sendFile(fullPath);
    } catch (error) {
      if (error.code === "ENOENT") return next();
      res.status(500).send(error.message || "Failed to serve file");
    }
  };
}

function handleWorkspaceAllowedChildren(req, res) {
  try {
    const { resolvedDir, rootDir } = resolveWorkspaceContext(req.query.base, req.query.root, req.query.parent);

    if (!fs.existsSync(resolvedDir)) {
      return res.status(404).json({ error: "Path not found on server", children: [] });
    }
    if (!fs.statSync(resolvedDir).isDirectory()) {
      return res.status(400).json({ error: "Not a directory", children: [] });
    }

    const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    const children = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => {
        const childPath = path.join(resolvedDir, entry.name);
        const relativePath = path.relative(rootDir, childPath).replace(/\\/g, "/");
        return { name: entry.name, path: relativePath };
      });
    res.json({ children });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.error, children: [] });
    }
    res.status(500).json({ error: error.message || "Failed to list directories" });
  }
}

function handleWorkspaceTree(_, res) {
  try {
    const cwd = getWorkspaceCwd();
    const tree = buildWorkspaceTree(cwd);
    res.json({ root: path.basename(cwd), tree });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to read workspace" });
  }
}

function handlePreviewRaw(req, res) {
  const relPath = req.query.path;
  if (typeof relPath !== "string" || !relPath.trim()) {
    return res.status(400).send("Missing or invalid path");
  }
  try {
    const cwd = getWorkspaceCwd();
    const { ok, fullPath, error } = resolveWithinRoot(cwd, relPath);
    if (!ok || !fullPath) {
      return res.status(403).send(error || "Path outside workspace");
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return res.status(400).send("Not a file");

    res.setHeader("Content-Type", getMimeForFile(fullPath));
    res.sendFile(fullPath);
  } catch (error) {
    if (error.code === "ENOENT") return res.status(404).send("File not found");
    res.status(500).send(error.message || "Failed to serve file");
  }
}

function handleWorkspaceFile(req, res) {
  const relPath = req.query.path;
  if (typeof relPath !== "string" || !relPath.trim()) {
    return res.status(400).json({ error: "Missing or invalid path" });
  }
  try {
    const cwd = getWorkspaceCwd();
    const { ok, fullPath, error } = resolveWithinRoot(cwd, relPath);
    if (!ok || !fullPath) {
      return res.status(403).json({ error: error || "Path outside workspace" });
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: "Not a file" });
    }

    const ext = path.extname(fullPath).toLowerCase().replace(/^\./, "");
    const isImage = IMAGE_EXT.has(ext);
    const relPathForResponse = path.relative(cwd, fullPath).replace(/\\/g, "/");

    if (isImage) {
      const buffer = fs.readFileSync(fullPath);
      const content = buffer.toString("base64");
      res.json({ path: relPathForResponse, content, isImage: true });
    } else {
      if (stat.size > MAX_TEXT_FILE_BYTES) {
        return res.status(413).json({
          error: `File too large to display (${Math.round(stat.size / 1024)} KB, max ${Math.round(MAX_TEXT_FILE_BYTES / 1024)} KB). Try a smaller file.`,
        });
      }
      const content = fs.readFileSync(fullPath, "utf8");
      res.json({ path: relPathForResponse, content });
    }
  } catch (error) {
    if (error.code === "ENOENT") return res.status(404).json({ error: "File not found" });
    res.status(500).json({ error: error.message || "Failed to read file" });
  }
}
