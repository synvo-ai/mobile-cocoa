/**
 * MCP server management service.
 *
 * Handles loading, saving, and managing MCP server configurations.
 * Supports both stdio-based (local commands) and http-based (remote endpoints) servers.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { projectRoot, loadMCPConfig } from "../config/index.js";

/** Load MCP config values from config/mcp.json (with fallbacks). */
function getMCPConfigValues() {
  const cfg = loadMCPConfig();
  return {
    serversFilePath: path.join(projectRoot, cfg.serversFile || "server/mcp/servers.json"),
    enabledFilePath: path.join(projectRoot, cfg.enabledFile || "server/mcp/enabled.json"),
    defaultType: cfg.defaultType || "stdio",
    testTimeoutMs: cfg.testTimeoutMs || 10000,
  };
}

/**
 * Generate a slug-like ID from a name.
 * @param {string} name
 * @returns {string}
 */
function generateIdFromName(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 8);
  return base ? `${base}-${suffix}` : suffix;
}

/**
 * Load all MCP server configurations from disk.
 * @returns {{ servers: Array<MCPServerConfig> }}
 */
export function loadMCPServers() {
  const { serversFilePath } = getMCPConfigValues();
  try {
    if (!fs.existsSync(serversFilePath)) {
      return { servers: [] };
    }
    const raw = fs.readFileSync(serversFilePath, "utf8");
    const data = JSON.parse(raw);
    return { servers: Array.isArray(data?.servers) ? data.servers : [] };
  } catch (err) {
    console.warn("[mcp] Failed to load servers file:", err?.message);
    return { servers: [] };
  }
}

/**
 * Save MCP server configurations to disk.
 * @param {Array<MCPServerConfig>} servers
 * @returns {{ ok: boolean; error?: string }}
 */
function saveMCPServers(servers) {
  const { serversFilePath } = getMCPConfigValues();
  try {
    fs.mkdirSync(path.dirname(serversFilePath), { recursive: true });
    fs.writeFileSync(serversFilePath, JSON.stringify({ servers }, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    console.warn("[mcp] Failed to save servers file:", err?.message);
    return { ok: false, error: err?.message ?? "Failed to save" };
  }
}

/**
 * Get a single MCP server by ID.
 * @param {string} id
 * @returns {MCPServerConfig | null}
 */
export function getMCPServer(id) {
  if (!id || typeof id !== "string") return null;
  const { servers } = loadMCPServers();
  return servers.find((s) => s.id === id) || null;
}

/**
 * Validate MCP server configuration.
 * @param {Partial<MCPServerConfig>} config
 * @returns {{ ok: boolean; errors?: string[] }}
 */
export function validateMCPConfig(config) {
  const errors = [];

  if (!config.name || typeof config.name !== "string" || !config.name.trim()) {
    errors.push("Name is required");
  }

  const type = config.type || getMCPConfigValues().defaultType;
  if (!["stdio", "http"].includes(type)) {
    errors.push("Type must be 'stdio' or 'http'");
  }

  if (type === "stdio") {
    if (!config.command || typeof config.command !== "string" || !config.command.trim()) {
      errors.push("Command is required for stdio servers");
    }
    if (config.args !== undefined && !Array.isArray(config.args)) {
      errors.push("Args must be an array");
    }
    if (config.env !== undefined && (typeof config.env !== "object" || config.env === null)) {
      errors.push("Env must be an object");
    }
  }

  if (type === "http") {
    if (!config.url || typeof config.url !== "string" || !config.url.trim()) {
      errors.push("URL is required for HTTP servers");
    } else {
      try {
        new URL(config.url);
      } catch {
        errors.push("URL must be a valid URL");
      }
    }
    if (config.headers !== undefined && (typeof config.headers !== "object" || config.headers === null)) {
      errors.push("Headers must be an object");
    }
  }

  return { ok: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Create a new MCP server configuration.
 * @param {Partial<MCPServerConfig>} config
 * @returns {{ ok: boolean; server?: MCPServerConfig; error?: string }}
 */
export function createMCPServer(config) {
  const validation = validateMCPConfig(config);
  if (!validation.ok) {
    return { ok: false, error: validation.errors?.join("; ") };
  }

  const { servers } = loadMCPServers();
  const { defaultType } = getMCPConfigValues();

  const now = new Date().toISOString();
  const newServer = {
    id: generateIdFromName(config.name),
    name: config.name.trim(),
    description: config.description?.trim() || "",
    type: config.type || defaultType,
    ...(config.type === "http" || (!config.type && defaultType === "http")
      ? {
          url: config.url?.trim(),
          headers: config.headers || undefined,
        }
      : {
          command: config.command?.trim(),
          args: Array.isArray(config.args) ? config.args.filter((a) => typeof a === "string") : [],
          env: config.env || undefined,
          cwd: config.cwd?.trim() || undefined,
        }),
    createdAt: now,
    updatedAt: now,
  };

  servers.push(newServer);
  const saveResult = saveMCPServers(servers);
  if (!saveResult.ok) {
    return { ok: false, error: saveResult.error };
  }

  return { ok: true, server: newServer };
}

/**
 * Update an existing MCP server configuration.
 * @param {string} id
 * @param {Partial<MCPServerConfig>} updates
 * @returns {{ ok: boolean; server?: MCPServerConfig; error?: string }}
 */
export function updateMCPServer(id, updates) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Invalid server ID" };
  }

  const { servers } = loadMCPServers();
  const index = servers.findIndex((s) => s.id === id);
  if (index === -1) {
    return { ok: false, error: "Server not found" };
  }

  const existing = servers[index];
  const merged = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt };

  const validation = validateMCPConfig(merged);
  if (!validation.ok) {
    return { ok: false, error: validation.errors?.join("; ") };
  }

  merged.updatedAt = new Date().toISOString();

  // Clean up type-specific fields
  if (merged.type === "http") {
    delete merged.command;
    delete merged.args;
    delete merged.env;
    delete merged.cwd;
  } else {
    delete merged.url;
    delete merged.headers;
  }

  servers[index] = merged;
  const saveResult = saveMCPServers(servers);
  if (!saveResult.ok) {
    return { ok: false, error: saveResult.error };
  }

  return { ok: true, server: merged };
}

/**
 * Delete an MCP server configuration.
 * @param {string} id
 * @returns {{ ok: boolean; error?: string }}
 */
export function deleteMCPServer(id) {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Invalid server ID" };
  }

  const { servers } = loadMCPServers();
  const index = servers.findIndex((s) => s.id === id);
  if (index === -1) {
    return { ok: false, error: "Server not found" };
  }

  servers.splice(index, 1);
  const saveResult = saveMCPServers(servers);
  if (!saveResult.ok) {
    return { ok: false, error: saveResult.error };
  }

  // Also remove from enabled list if present
  const enabledIds = getEnabledMCPIds();
  if (enabledIds.includes(id)) {
    setEnabledMCPIds(enabledIds.filter((eid) => eid !== id));
  }

  return { ok: true };
}

/**
 * Get enabled MCP server IDs from persistence.
 * @returns {string[]}
 */
export function getEnabledMCPIds() {
  const { enabledFilePath } = getMCPConfigValues();
  try {
    if (!fs.existsSync(enabledFilePath)) return [];
    const data = JSON.parse(fs.readFileSync(enabledFilePath, "utf8"));
    const ids = data?.enabledIds;
    const filtered = Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && x) : [];
    return [...new Set(filtered)];
  } catch (err) {
    console.warn("[mcp] Failed to read enabled file:", err?.message);
    return [];
  }
}

/**
 * Set enabled MCP server IDs in persistence.
 * @param {string[]} enabledIds - List of server IDs to enable
 * @returns {{ ok: boolean; error?: string }}
 */
export function setEnabledMCPIds(enabledIds) {
  const normalized = Array.isArray(enabledIds)
    ? enabledIds.filter((x) => typeof x === "string" && x.trim())
    : [];

  // Validate all IDs exist
  const { servers } = loadMCPServers();
  const serverIds = new Set(servers.map((s) => s.id));
  const validIds = normalized.filter((id) => serverIds.has(id));

  const { enabledFilePath } = getMCPConfigValues();
  try {
    fs.mkdirSync(path.dirname(enabledFilePath), { recursive: true });
    fs.writeFileSync(enabledFilePath, JSON.stringify({ enabledIds: validIds }, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    console.warn("[mcp] Failed to write enabled file:", err?.message);
    return { ok: false, error: err?.message ?? "Failed to save" };
  }
}

/**
 * Get full configurations of enabled MCP servers.
 * Used for Pi CLI integration.
 * @returns {MCPServerConfig[]}
 */
export function getEnabledMCPServers() {
  const enabledIds = getEnabledMCPIds();
  if (enabledIds.length === 0) return [];

  const { servers } = loadMCPServers();
  const enabledSet = new Set(enabledIds);
  return servers.filter((s) => enabledSet.has(s.id));
}

/**
 * Test connection to an MCP server.
 * For stdio servers, spawns the process briefly and checks for valid MCP response.
 * For http servers, makes a health check request.
 * @param {string} id
 * @returns {Promise<{ ok: boolean; serverInfo?: object; tools?: any[]; resources?: any[]; error?: string }>}
 */
export async function testMCPServer(id) {
  const server = getMCPServer(id);
  if (!server) {
    return { ok: false, error: "Server not found" };
  }

  const { testTimeoutMs } = getMCPConfigValues();

  if (server.type === "http") {
    // For HTTP servers, just check if the URL is reachable
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), testTimeoutMs);

      const response = await fetch(server.url, {
        method: "GET",
        signal: controller.signal,
        headers: server.headers || {},
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { ok: true, serverInfo: { type: "http", url: server.url, status: response.status } };
      } else {
        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (err) {
      return { ok: false, error: err?.message ?? "Connection failed" };
    }
  }

  // For stdio servers, spawn the process and send MCP initialize
  return new Promise((resolve) => {
    let resolved = false;
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill("SIGTERM");
        resolve({ ok: false, error: "Connection timeout" });
      }
    }, testTimeoutMs);

    const child = spawn(server.command, server.args || [], {
      cwd: server.cwd || process.cwd(),
      env: { ...process.env, ...(server.env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (data) => {
      stdout += data.toString();
      // Try to parse MCP response
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.result && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            child.kill("SIGTERM");
            resolve({
              ok: true,
              serverInfo: msg.result.serverInfo || { name: server.name },
              tools: msg.result.capabilities?.tools ? [] : undefined,
              resources: msg.result.capabilities?.resources ? [] : undefined,
            });
          }
        } catch {
          // Not valid JSON yet, continue
        }
      }
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ ok: false, error: err?.message ?? "Failed to spawn process" });
      }
    });

    child.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (code !== 0) {
          resolve({ ok: false, error: stderr || `Process exited with code ${code}` });
        } else {
          resolve({ ok: true, serverInfo: { name: server.name } });
        }
      }
    });

    // Send MCP initialize request
    const initRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mobile-cocoa", version: "1.0.0" },
      },
    });

    try {
      child.stdin.write(initRequest + "\n");
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ ok: false, error: "Failed to write to process stdin" });
      }
    }
  });
}

/**
 * Build MCP configuration object for Pi CLI integration.
 * Returns a config object in the format expected by Pi's MCP extension.
 * @returns {object}
 */
export function buildMCPConfigForPi() {
  const enabledServers = getEnabledMCPServers();
  if (enabledServers.length === 0) return {};

  const mcpServers = {};
  for (const server of enabledServers) {
    if (server.type === "stdio") {
      mcpServers[server.id] = {
        command: server.command,
        args: server.args || [],
        env: server.env || {},
      };
    } else if (server.type === "http") {
      mcpServers[server.id] = {
        url: server.url,
        headers: server.headers || {},
      };
    }
  }

  return { mcpServers };
}

export { projectRoot };
