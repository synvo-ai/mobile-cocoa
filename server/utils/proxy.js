/**
 * Local reverse proxy — port multiplexer for Cloudflare Tunnel.
 *
 * Listens on port 9443 and routes to localhost ports based on X-Target-Port
 * header or _targetPort query param. Used with cloudflared so the mobile app
 * can reach the dev server and preview (e.g. Vite) via a single tunnel URL.
 *
 * Port whitelist: reads config/ports.json and only allows listed ports.
 * Watches the file for changes so the whitelist hot-reloads without restart.
 *
 * Routing:
 *   - X-Target-Port header or _targetPort query → localhost:<that port>
 *   - No header/param → localhost:3456 (main server)
 *
 * Usage:
 *   node server/utils/proxy.js
 *
 * Environment:
 *   PROXY_PORT              - Port this proxy listens on (default: 9443)
 *   PROXY_DEFAULT_TARGET_PORT - Default backend when no X-Target-Port (default: 3456)
 *   PORT                    - Fallback for default target (default: 3456)
 */
import fs from "fs";
import http from "http";
import path from "path";
import { URL, fileURLToPath } from "url";
import {
  PROXY_BIND_HOST,
  PROXY_DEFAULT_TARGET_PORT,
  PROXY_LOOPBACK_HOST,
  TUNNEL_PROXY_PORT,
} from "../config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTS_CONFIG_PATH = path.resolve(__dirname, "../../config/ports.json");

const PROXY_PORT = TUNNEL_PROXY_PORT;
const DEFAULT_TARGET_PORT = PROXY_DEFAULT_TARGET_PORT;

const MIN_PORT = 1024;
const MAX_PORT = 65535;

function isValidPort(port) {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}

// ── Port whitelist (hot-reloadable) ──────────────────────────────────────────

let allowedPorts = new Set();

function loadPortWhitelist() {
  try {
    const raw = fs.readFileSync(PORTS_CONFIG_PATH, "utf8");
    const cfg = JSON.parse(raw);
    if (cfg && Array.isArray(cfg.exposedPorts)) {
      const next = new Set(cfg.exposedPorts.map((e) => e.port).filter(isValidPort));
      next.add(DEFAULT_TARGET_PORT);
      allowedPorts = next;
      console.log(`[proxy] Port whitelist reloaded: ${[...allowedPorts].sort((a, b) => a - b).join(", ")}`);
    }
  } catch {
    allowedPorts = new Set([DEFAULT_TARGET_PORT]);
    console.log(`[proxy] No ports.json found, allowing default port ${DEFAULT_TARGET_PORT} only`);
  }
}

loadPortWhitelist();

try {
  fs.watch(PORTS_CONFIG_PATH, { persistent: false }, (eventType) => {
    if (eventType === "change" || eventType === "rename") {
      setTimeout(() => loadPortWhitelist(), 100);
    }
  });
} catch {
  console.log("[proxy] Could not watch ports.json — whitelist changes require restart");
}

function isPortAllowed(port) {
  return allowedPorts.has(port);
}

// ── Cookie helper ────────────────────────────────────────────────────────────

function parseCookiePort(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return NaN;
  const match = cookieHeader.match(/(?:^|;\s*)_tp=(\d+)/);
  return match ? parseInt(match[1], 10) : NaN;
}

// ── HTTP proxy ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const targetPortHeader = req.headers["x-target-port"];
  let targetPort = DEFAULT_TARGET_PORT;
  let requestUrl = req.url;
  let shouldSetCookie = false;

  if (targetPortHeader) {
    const parsed = parseInt(String(targetPortHeader), 10);
    if (isValidPort(parsed)) {
      targetPort = parsed;
      shouldSetCookie = true;
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Invalid X-Target-Port: ${targetPortHeader}` }));
      return;
    }
  } else {
    try {
      const parsedUrl = new URL(requestUrl, `http://${PROXY_LOOPBACK_HOST}:${PROXY_PORT}`);
      const queryTargetPort = parsedUrl.searchParams.get("_targetPort");
      if (queryTargetPort) {
        const parsed = parseInt(queryTargetPort, 10);
        if (isValidPort(parsed)) {
          targetPort = parsed;
          shouldSetCookie = true;
          parsedUrl.searchParams.delete("_targetPort");
          requestUrl = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
        }
      } else {
        // Fallback: check _tp cookie for sub-resource requests (images, CSS, JS)
        const cookiePort = parseCookiePort(req);
        if (isValidPort(cookiePort)) {
          targetPort = cookiePort;
        }
      }
    } catch {
      // Malformed URL; use defaults
    }
  }

  if (!isPortAllowed(targetPort)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Port not exposed",
      message: `Port ${targetPort} is not in the exposed ports whitelist. Add it via the mobile app's Port Forwarding settings.`,
      port: targetPort,
    }));
    return;
  }

  const proxyOptions = {
    hostname: PROXY_LOOPBACK_HOST,
    port: targetPort,
    path: requestUrl,
    method: req.method,
    headers: { ...req.headers },
  };

  delete proxyOptions.headers["x-target-port"];
  proxyOptions.headers.host = `${PROXY_LOOPBACK_HOST}:${targetPort}`;
  proxyOptions.headers["x-tunnel-proxy"] = "1";

  const proxyReq = http.request(proxyOptions, (proxyRes) => {
    const responseHeaders = {
      ...proxyRes.headers,
      "x-proxied-port": String(targetPort),
    };
    // Set _tp cookie so sub-resource requests (images, CSS, JS) route to the same port
    if (shouldSetCookie && targetPort !== DEFAULT_TARGET_PORT) {
      responseHeaders["set-cookie"] = `_tp=${targetPort}; Path=/; SameSite=Lax; Max-Age=86400`;
    }

    const isSSE = (proxyRes.headers["content-type"] || "").includes("text/event-stream");

    // #region agent log
    if (requestUrl.includes('/stream') || isSSE) { fetch('http://127.0.0.1:7858/ingest/d7d38859-3779-4ab0-968f-91cf91a262e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'099c89'},body:JSON.stringify({sessionId:'099c89',location:'proxy.js:response-check',message:'Proxy response received',data:{isSSE,requestUrl,targetPort,contentType:proxyRes.headers["content-type"]||'MISSING',statusCode:proxyRes.statusCode},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{}); }
    // #endregion

    if (isSSE) {
      // SSE: disable buffering so events flow through immediately
      responseHeaders["x-accel-buffering"] = "no";
      responseHeaders["cache-control"] = "no-cache";
      // #region agent log
      fetch('http://127.0.0.1:7858/ingest/d7d38859-3779-4ab0-968f-91cf91a262e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'099c89'},body:JSON.stringify({sessionId:'099c89',location:'proxy.js:sse-detect',message:'SSE response detected',data:{targetPort,contentType:proxyRes.headers["content-type"],transferEncoding:proxyRes.headers["transfer-encoding"]||'none',upstreamHeaders:Object.keys(proxyRes.headers)},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      res.writeHead(proxyRes.statusCode, responseHeaders);
      // Disable Nagle's algorithm on all involved sockets for instant forwarding
      if (res.socket) res.socket.setNoDelay(true);
      if (proxyRes.socket) proxyRes.socket.setNoDelay(true);
      if (proxyReq.socket) proxyReq.socket.setNoDelay(true);
      let sseChunkCount = 0;
      proxyRes.on("data", (chunk) => {
        sseChunkCount++;
        const writeOk = res.write(chunk);
        // #region agent log
        if (sseChunkCount <= 20 || sseChunkCount % 50 === 0) { fetch('http://127.0.0.1:7858/ingest/d7d38859-3779-4ab0-968f-91cf91a262e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'099c89'},body:JSON.stringify({sessionId:'099c89',location:'proxy.js:sse-chunk',message:'SSE chunk forwarded',data:{chunkNum:sseChunkCount,chunkLen:chunk.length,writeOk,socketDestroyed:!!res.socket?.destroyed,writableEnded:res.writableEnded},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{}); }
        // #endregion
      });
      proxyRes.on("end", () => {
        // #region agent log
        fetch('http://127.0.0.1:7858/ingest/d7d38859-3779-4ab0-968f-91cf91a262e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'099c89'},body:JSON.stringify({sessionId:'099c89',location:'proxy.js:sse-end',message:'SSE upstream ended',data:{totalChunks:sseChunkCount},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        res.end();
      });
    } else {
      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res, { end: true });
    }
  });

  proxyReq.on("error", (err) => {
    console.error(`[proxy] Error forwarding to ${PROXY_LOOPBACK_HOST}:${targetPort}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Bad Gateway",
          message: `Cannot reach ${PROXY_LOOPBACK_HOST}:${targetPort}`,
          port: targetPort,
        })
      );
    }
  });

  req.pipe(proxyReq, { end: true });
});

// ── WebSocket upgrade ────────────────────────────────────────────────────────

server.on("upgrade", (req, socket, head) => {
  const targetPortHeader = req.headers["x-target-port"];
  let targetPort = DEFAULT_TARGET_PORT;
  let requestUrl = req.url;

  if (targetPortHeader) {
    const parsed = parseInt(String(targetPortHeader), 10);
    if (isValidPort(parsed)) {
      targetPort = parsed;
    } else {
      socket.destroy();
      return;
    }
  } else {
    try {
      const parsedUrl = new URL(requestUrl, `http://${PROXY_LOOPBACK_HOST}:${PROXY_PORT}`);
      const queryTargetPort = parsedUrl.searchParams.get("_targetPort");
      if (queryTargetPort) {
        const parsed = parseInt(queryTargetPort, 10);
        if (isValidPort(parsed)) {
          targetPort = parsed;
          parsedUrl.searchParams.delete("_targetPort");
          requestUrl = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
        }
      } else {
        // Fallback: check _tp cookie for WebSocket connections from the same page
        const cookiePort = parseCookiePort(req);
        if (isValidPort(cookiePort)) {
          targetPort = cookiePort;
        }
      }
    } catch {
      // Malformed URL; use defaults
    }
  }

  if (!isPortAllowed(targetPort)) {
    socket.destroy();
    return;
  }

  const proxyOptions = {
    hostname: PROXY_LOOPBACK_HOST,
    port: targetPort,
    path: requestUrl,
    method: req.method,
    headers: { ...req.headers },
  };
  delete proxyOptions.headers["x-target-port"];
  proxyOptions.headers.host = `${PROXY_LOOPBACK_HOST}:${targetPort}`;
  proxyOptions.headers["x-tunnel-proxy"] = "1";

  const proxyReq = http.request(proxyOptions);
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n") +
      "\r\n\r\n"
    );
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on("error", (err) => {
    console.error(`[proxy] WebSocket upgrade error to ${PROXY_LOOPBACK_HOST}:${targetPort}:`, err.message);
    socket.destroy();
  });

  proxyReq.end();
});

// ── Start ────────────────────────────────────────────────────────────────────

const BIND_HOST = PROXY_BIND_HOST;

server.listen(PROXY_PORT, BIND_HOST, () => {
  console.log(`[proxy] Listening on ${BIND_HOST}:${PROXY_PORT}`);
  console.log(`[proxy] Default target: ${PROXY_LOOPBACK_HOST}:${DEFAULT_TARGET_PORT}`);
  console.log(`[proxy] Allowed ports: ${[...allowedPorts].sort((a, b) => a - b).join(", ")}`);
  // #region agent log
  console.log(`[proxy][DBG-099c89] Instrumented proxy started`);
  fetch('http://127.0.0.1:7858/ingest/d7d38859-3779-4ab0-968f-91cf91a262e5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'099c89'},body:JSON.stringify({sessionId:'099c89',location:'proxy.js:startup',message:'Proxy started with instrumentation',data:{proxyPort:PROXY_PORT,bindHost:BIND_HOST},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  console.log(`[proxy] Watching ${PORTS_CONFIG_PATH} for whitelist changes`);
});

process.on("SIGINT", () => {
  console.log("[proxy] Shutting down...");
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  console.log("[proxy] Shutting down...");
  server.close(() => process.exit(0));
});
