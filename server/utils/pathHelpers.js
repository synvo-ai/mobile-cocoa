/**
 * Path and file utilities for server routes.
 * Centralizes path normalization and security checks to prevent directory traversal.
 */
import path from "path";
import fs from "fs";

/** Pattern to detect directory traversal segment usage. */
const TRAVERSAL_PATTERN = /(?:^|[\\/])\.\.(?:$|[\\/])/;

const hasTraversalSegment = (value) => TRAVERSAL_PATTERN.test(value);

/**
 * Normalize a relative path and strip directory traversal attempts.
 * @param {string} relPath - Relative path from request
 * @returns {string} Sanitized path safe for joining with workspace root
 */
export function normalizeRelativePath(relPath) {
  if (typeof relPath !== "string" || !relPath.trim()) return "";
  const sanitizedInput = relPath.trim().replace(/\\/g, "/");

  if (hasTraversalSegment(sanitizedInput)) {
    throw new Error(`Path traversal detected: "${relPath}"`);
  }

  const normalized = path.normalize(sanitizedInput);
  if (!normalized || normalized === "." || normalized === "/" || normalized === "\\") {
    return "";
  }

  if (path.isAbsolute(normalized) || /^[a-zA-Z]:[\\/]/.test(normalized)) {
    throw new Error(`Absolute paths are not allowed: "${relPath}"`);
  }

  return normalized.replace(/^[/\\]+/, "");
}

function existsOrSymbolic(pathToCheck) {
  try {
    fs.lstatSync(pathToCheck);
    return true;
  } catch {
    return false;
  }
}

function safeRealPath(pathToResolve) {
  try {
    return fs.realpathSync(pathToResolve);
  } catch {
    return null;
  }
}

function resolveThroughExistingAncestor(candidatePath) {
  let current = path.resolve(candidatePath);

  while (!existsOrSymbolic(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }

  const currentReal = safeRealPath(current);
  if (!currentReal) {
    return null;
  }

  const remainder = path.relative(current, path.resolve(candidatePath));
  return path.resolve(currentReal, remainder);
}

function isInsideRoot(rootDir, targetPath) {
  const rel = path.relative(rootDir, targetPath);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

/**
 * Resolve and validate that a path stays within a root directory.
 * @param {string} rootDir - Absolute root path (e.g. workspace cwd)
 * @param {string} relativePath - Path relative to root
 * @returns {{ ok: boolean; fullPath?: string; error?: string }}
 */
export function resolveWithinRoot(rootDir, relativePath) {
  let normalized;
  try {
    normalized = normalizeRelativePath(relativePath);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid path",
    };
  }

  const requested = path.resolve(path.join(rootDir, normalized));
  const rootReal = safeRealPath(rootDir);

  if (!rootReal) {
    return { ok: false, error: "Invalid workspace root" };
  }

  const fullPath = safeRealPath(requested) ?? resolveThroughExistingAncestor(requested);
  if (!fullPath) {
    return { ok: false, error: "Path resolution failed" };
  }

  if (!isInsideRoot(rootReal, fullPath)) {
    return { ok: false, error: "Path outside root" };
  }
  return { ok: true, fullPath };
}

/**
 * Map file extension to MIME type for common web formats.
 * @param {string} filename - Filename or path
 * @returns {string} MIME type
 */
export function getMimeForFile(filename) {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
  const mimeMap = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}
