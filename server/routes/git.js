/**
 * Git routes (commits, tree, status, diff, actions).
 */
import { spawnSync } from "child_process";
import path from "path";
import { getWorkspaceCwd } from "../config/index.js";
import {
    getGitCommits, getGitStatus, getGitTree, gitAdd,
    gitCommit, gitInit, gitPush
} from "../utils/git.js";
import { normalizeRelativePath, resolveWithinRoot } from "../utils/index.js";

export function registerGitRoutes(app) {
  app.get("/api/git/commits", handleGitCommits);
  app.get("/api/git/tree", handleGitTree);
  app.get("/api/git/status", handleGitStatus);
  app.get("/api/git/diff", handleGitDiff);
  app.post("/api/git/action", handleGitAction);
}

function handleGitCommits(req, res) {
  try {
    const cwd = getWorkspaceCwd();
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const commits = getGitCommits(cwd, limit);
    res.json({ commits });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to get git commits" });
  }
}

function handleGitTree(req, res) {
  try {
    const cwd = getWorkspaceCwd();
    const relPath = typeof req.query.path === "string" ? req.query.path : "";
    const normalized = normalizeRelativePath(relPath);
    const tree = getGitTree(cwd, normalized);
    res.json({ tree });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to get git tree" });
  }
}

function handleGitStatus(_, res) {
  try {
    const cwd = getWorkspaceCwd();
    const status = getGitStatus(cwd);
    res.json({ status });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to get git status" });
  }
}

async function handleGitDiff(req, res) {
  try {
    const cwd = getWorkspaceCwd();
    const file = typeof req.query.file === "string" ? req.query.file : "";
    const isStaged = req.query.staged === "true";

    const args = ["diff", "--color=never"];
    if (isStaged) args.push("--cached");
    if (file) {
      const { ok, fullPath, error } = resolveWithinRoot(cwd, file);
      if (!ok || !fullPath) {
        return res.status(403).json({ error: error || "Path outside workspace" });
      }

      const safeFile = path.relative(cwd, fullPath).replace(/\\/g, "/");
      args.push("--");
      args.push(safeFile);
    }

    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0 && result.status !== 1) {
      return res.status(500).json({ error: result.stderr || "Git diff failed" });
    }

    res.json({ diff: result.stdout });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to get git diff" });
  }
}

function handleGitAction(req, res) {
  try {
    const cwd = getWorkspaceCwd();
    const action = req.body?.action;

    if (action === "stage") {
      const files = req.body?.files || [];
      const result = gitAdd(cwd, files);
      return res.json(result);
    }
    if (action === "commit") {
      const message = req.body?.message;
      const result = gitCommit(cwd, message);
      return res.json(result);
    }
    if (action === "push") {
      const result = gitPush(cwd);
      return res.json(result);
    }
    if (action === "init") {
      const result = gitInit(cwd);
      return res.json(result);
    }

    res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to execute git action" });
  }
}
