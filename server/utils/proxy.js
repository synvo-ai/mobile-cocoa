/**
 * Local reverse proxy — port multiplexer for Cloudflare Tunnel.
 *
 * Listens on port 9443 and routes to localhost ports based on X-Target-Port
 * header or _targetPort query param. Used with cloudflared so the mobile app
 * can reach the dev server and preview (e.g. Vite) via a single tunnel URL.
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
import http from "http";
import { URL } from "url";
import {
  PROXY_BIND_HOST,
  PROXY_DEFAULT_TARGET_PORT,
  PROXY_LOOPBACK_HOST,
  TUNNEL_PROXY_PORT,
} from "../config/index.js";

const PROXY_PORT = TUNNEL_PROXY_PORT;
const DEFAULT_TARGET_PORT = PROXY_DEFAULT_TARGET_PORT;

const MIN_PORT = 1024;
const MAX_PORT = 65535;

function isValidPort(port) {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}

const server = http.createServer((req, res) => {
  const targetPortHeader = req.headers["x-target-port"];
  let targetPort = DEFAULT_TARGET_PORT;
  let requestUrl = req.url;

  if (targetPortHeader) {
    const parsed = parseInt(String(targetPortHeader), 10);
    if (isValidPort(parsed)) {
      targetPort = parsed;
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
          parsedUrl.searchParams.delete("_targetPort");
          requestUrl = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
        }
      }
    } catch {
      // Malformed URL; use defaults
    }
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
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      "x-proxied-port": String(targetPort),
    });
    proxyRes.pipe(res, { end: true });
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
      }
    } catch {
      // Malformed URL; use defaults
    }
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

const BIND_HOST = PROXY_BIND_HOST;

server.listen(PROXY_PORT, BIND_HOST, () => {
  console.log(`[proxy] Listening on ${BIND_HOST}:${PROXY_PORT}`);
  console.log(`[proxy] Default target: ${PROXY_LOOPBACK_HOST}:${DEFAULT_TARGET_PORT}`);
  console.log(`[proxy] Use X-Target-Port or _targetPort query to route to other ports`);
});

process.on("SIGINT", () => {
  console.log("[proxy] Shutting down...");
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  console.log("[proxy] Shutting down...");
  server.close(() => process.exit(0));
});
