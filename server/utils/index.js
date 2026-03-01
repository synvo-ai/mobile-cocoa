/**
 * Utility functions for the server.
 */
import fs from "fs";
import path from "path";
import { getOverlayNetwork, TUNNEL_PROXY_PORT } from "../config/index.js";

/** Cached preview host (tunnel proxy or PREVIEW_HOST) for system prompt substitution. */
let cachedPreviewHost = null;

/**
 * Get the preview host for this session.
 * Used to inject into system prompt so the agent outputs URLs the mobile client can open.
 *
 * Resolution order:
 *   1. PREVIEW_HOST env var (explicit override)
 *   2. Tunnel: returns a marker so mobile resolves preview via proxy (_targetPort)
 *   3. "(not set)"
 *
 * @returns {string} Hostname or overlay marker
 */
export function getPreviewHost() {
  if (cachedPreviewHost !== null) return cachedPreviewHost;
  const fromEnv = (process.env.PREVIEW_HOST || "").trim();
  if (fromEnv) {
    try {
      const u = fromEnv.startsWith("http") ? fromEnv : `http://${fromEnv}`;
      cachedPreviewHost = new URL(u).hostname;
      return cachedPreviewHost;
    } catch {
      cachedPreviewHost = fromEnv;
      return cachedPreviewHost;
    }
  }

  const overlay = getOverlayNetwork();

  if (overlay === "tunnel") {
    cachedPreviewHost = `tunnel-proxy:${TUNNEL_PROXY_PORT}`;
    return cachedPreviewHost;
  }

  cachedPreviewHost = "(not set)";
  return cachedPreviewHost;
}

/**
 * Get the overlay network type for display / context.
 * @returns {"tunnel" | "none"}
 */
export function getActiveOverlay() {
  return getOverlayNetwork();
}

const ANSI_REGEX =
  /\x1B\[[0-9;?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[@-_]|\x1B.|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

export function stripAnsi(str) {
  if (typeof str !== "string") return "";
  return str.replace(ANSI_REGEX, "");
}


const SKIP_DIRS = new Set([
  "node_modules", ".git", ".idea", ".vscode", "dist", "build", "out",
  ".cache", "coverage", ".nyc_output", ".expo"
]);

export function buildWorkspaceTree(dirPath, basePath = "") {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name === "Thumbs.db") continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    const fullPath = path.join(dirPath, entry.name);
    const isFolder = entry.isDirectory()
      || (entry.isSymbolicLink() && (() => {
        try {
          return fs.statSync(fullPath).isDirectory();
        } catch {
          return false;
        }
      })());
    if (isFolder) {
      try {
        const children = buildWorkspaceTree(fullPath, relPath);
        items.push({ name: entry.name, path: relPath, type: "folder", children });
      } catch (_) {
        items.push({ name: entry.name, path: relPath, type: "folder", children: [] });
      }
    } else {
      items.push({ name: entry.name, path: relPath, type: "file" });
    }
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return items;
}

export const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"]);
export const MAX_TEXT_FILE_BYTES = 512 * 1024; // 500 KB - prevents huge files like package-lock.json from freezing the viewer

export { getMimeForFile, normalizeRelativePath, resolveWithinRoot } from "./pathHelpers.js";
