/**
 * MCP server management routes.
 */
import {
  loadMCPServers,
  getMCPServer,
  createMCPServer,
  updateMCPServer,
  deleteMCPServer,
  getEnabledMCPIds,
  setEnabledMCPIds,
  testMCPServer,
} from "../mcp/index.js";

export function registerMCPRoutes(app) {
  // List all MCP servers
  app.get("/api/mcp-servers", (_, res) => {
    try {
      const data = loadMCPServers();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to list MCP servers" });
    }
  });

  // Get single MCP server by ID
  app.get("/api/mcp-servers/:id", (req, res) => {
    const id = req.params?.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid server id" });
    }
    try {
      const server = getMCPServer(id);
      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }
      res.json(server);
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to load server" });
    }
  });

  // Create new MCP server
  app.post("/api/mcp-servers", (req, res) => {
    try {
      const config = req.body;
      if (!config || typeof config !== "object") {
        return res.status(400).json({ error: "Invalid request body" });
      }
      const result = createMCPServer(config);
      if (result.ok) {
        res.status(201).json({ ok: true, server: result.server });
      } else {
        res.status(400).json({ ok: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to create server" });
    }
  });

  // Update MCP server
  app.put("/api/mcp-servers/:id", (req, res) => {
    const id = req.params?.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid server id" });
    }
    try {
      const updates = req.body;
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ error: "Invalid request body" });
      }
      const result = updateMCPServer(id, updates);
      if (result.ok) {
        res.json({ ok: true, server: result.server });
      } else {
        res.status(result.error === "Server not found" ? 404 : 400).json({ ok: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to update server" });
    }
  });

  // Delete MCP server
  app.delete("/api/mcp-servers/:id", (req, res) => {
    const id = req.params?.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid server id" });
    }
    try {
      const result = deleteMCPServer(id);
      if (result.ok) {
        res.json({ ok: true });
      } else {
        res.status(result.error === "Server not found" ? 404 : 400).json({ ok: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to delete server" });
    }
  });

  // Get enabled MCP server IDs
  app.get("/api/mcp-servers-enabled", (_, res) => {
    try {
      const enabledIds = getEnabledMCPIds();
      res.json({ enabledIds });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to get enabled servers" });
    }
  });

  // Set enabled MCP server IDs
  app.post("/api/mcp-servers-enabled", (req, res) => {
    try {
      const enabledIds = Array.isArray(req.body?.enabledIds) ? req.body.enabledIds : [];
      const result = setEnabledMCPIds(enabledIds);
      if (result.ok) {
        res.json({ enabledIds: getEnabledMCPIds() });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to update enabled servers" });
    }
  });

  // Test MCP server connection
  app.post("/api/mcp-servers/:id/test", async (req, res) => {
    const id = req.params?.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing or invalid server id" });
    }
    try {
      const result = await testMCPServer(id);
      if (result.ok) {
        res.json({
          ok: true,
          serverInfo: result.serverInfo,
          tools: result.tools,
          resources: result.resources,
        });
      } else {
        res.status(400).json({ ok: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to test server" });
    }
  });
}
