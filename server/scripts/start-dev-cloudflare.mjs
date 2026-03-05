#!/usr/bin/env node
/**
 * Start proxy + dev server + Cloudflare tunnel (+ optional mobile frontend) in one go.
 *
 * Usage:
 *   npm run dev:cloudflare              # starts everything INCLUDING the Expo mobile frontend
 *   npm run dev:cloudflare -- --no-mobile   # backend only (proxy + server + tunnel)
 *
 * When the tunnel URL is detected, the Expo dev server is automatically started
 * with the correct EXPO_PUBLIC_SERVER_URL, so you don't need a second terminal.
 *
 * A second cloudflared tunnel is used for the Metro bundler (port 8081) instead
 * of Expo's built-in ngrok tunnel which is unreliable on the free tier.
 *
 * Requires: cloudflared (e.g. brew install cloudflared).
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import http from "http";
import { TUNNEL_PROXY_PORT, PROXY_LOOPBACK_HOST, PROXY_DEFAULT_TARGET_PORT } from "../config/index.js";

const require = createRequire(import.meta.url);
const qrcode = require("qrcode-terminal");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const noMobile = process.argv.includes("--no-mobile");

const children = [];

function run(name, command, args, opts = {}) {
  const cwd = opts.cwd ?? ROOT;
  const env = { ...process.env, ...opts.env };
  const inherit = opts.inherit !== false;
  const child = spawn(command, args, {
    stdio: inherit ? "inherit" : "pipe",
    cwd,
    env,
    detached: opts.detached ?? false,
  });
  if (!inherit) {
    child.stdout?.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
    child.stderr?.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  }
  child.on("error", (err) => console.error(`[${name}] error:`, err.message));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null && opts.fatal !== false) {
      console.error(`[${name}] exited with ${code}`);
      killAll();
      process.exit(code);
    }
  });
  children.push(child);
  return child;
}

function killAll() {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch (_) { }
  }
}

process.on("SIGINT", () => {
  killAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  killAll();
  process.exit(0);
});

// 1. Proxy (port 9443) — background
// Moved to after dev server starts

// 2. Dev server (port 3456) — background with auto-restart.
// fatal: false prevents the entire stack from dying if the AI agent kills the server.
const DEV_MAX_RESTARTS = 5;
const DEV_RESTART_BASE_MS = 2000;
let devRestartCount = 0;

function startDevServer() {
  const child = run("dev", npm, ["run", "dev"], {
    inherit: false,
    fatal: false,
    env: { ...process.env, OVERLAY_NETWORK: "tunnel", DEBUG_SSE: "1" },
  });
  child.on("exit", (code) => {
    if (code === 0 || code === null) return;
    if (devRestartCount >= DEV_MAX_RESTARTS) {
      console.error(`[dev] max restarts (${DEV_MAX_RESTARTS}) exceeded, giving up`);
      return;
    }
    devRestartCount++;
    const delay = Math.min(DEV_RESTART_BASE_MS * Math.pow(2, devRestartCount - 1), 30_000);
    console.log(`[dev] crashed (code ${code}), restarting in ${delay}ms (attempt ${devRestartCount}/${DEV_MAX_RESTARTS})`);
    setTimeout(startDevServer, delay);
  });
}

// setTimeout(startDevServer, 1500); // Removed, called explicitly below

// 3. Cloudflare tunnel — foreground so user sees the URL; capture and print Expo command
const urlRegex = /https:\/\/[^\s"'<>]+\.(trycloudflare\.com|cfargotunnel\.com)[^\s"'<>]*/i;
let tunnelUrlPrinted = false;



/** Poll localhost:port until it responds (or timeout). */
function waitForPort(port, { timeoutMs = 60_000, intervalMs = 1000, label = `port ${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const DIM = "\x1b[2m";
    const RESET = "\x1b[0m";

    function attempt() {
      if (Date.now() > deadline) {
        return reject(new Error(`[${label}] timed out waiting for port ${port}`));
      }
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();          // drain
        resolve();
      });
      req.on("error", () => {
        setTimeout(attempt, intervalMs);
      });
      req.setTimeout(800, () => {
        req.destroy();
        setTimeout(attempt, intervalMs);
      });
    }
    console.log(`${DIM}[${label}] Waiting for localhost:${port} to be ready...${RESET}`);
    attempt();
  });
}

function startMobileFrontend(apiTunnelUrl) {
  if (noMobile) return;

  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";
  const CYAN = "\x1b[36m";
  const GREEN = "\x1b[32m";
  const DIM = "\x1b[2m";
  const YELLOW = "\x1b[33m";
  const WHITE = "\x1b[37m";

  // Start the Metro cloudflared tunnel FIRST so we get the public URL
  // before Expo starts. EXPO_PACKAGER_PROXY_URL makes Metro generate
  // correct public URLs in its manifest instead of localhost:8081.
  // Retries with backoff if Cloudflare rate-limits (429 Too Many Requests).
  const METRO_TUNNEL_MAX_RETRIES = 5;
  const METRO_TUNNEL_BASE_DELAY = 10_000; // 10s initial wait on rate limit
  let metroTunnelAttempt = 0;

  function startMetroTunnel() {
    metroTunnelAttempt++;
    if (metroTunnelAttempt > 1) {
      const delay = METRO_TUNNEL_BASE_DELAY * Math.pow(2, metroTunnelAttempt - 2);
      console.log(`${DIM}[metro-tunnel] Retry ${metroTunnelAttempt}/${METRO_TUNNEL_MAX_RETRIES} in ${delay / 1000}s...${RESET}`);
    } else {
      console.log(`\n${DIM}[mobile] Starting Metro Cloudflare tunnel...${RESET}\n`);
    }

    const metroTunnel = spawn("cloudflared", [
      "tunnel", "--no-autoupdate", "--config", "/dev/null",
      "--url", "http://localhost:8081",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
      env: process.env,
      detached: false,
    });
    metroTunnel.on("error", (err) => console.error("[metro-tunnel] error:", err.message));
    metroTunnel.on("exit", (code) => {
      if (code !== 0 && code != null) {
        console.error(`[metro-tunnel] exited with ${code}`);
        if (metroTunnelAttempt < METRO_TUNNEL_MAX_RETRIES) {
          const delay = METRO_TUNNEL_BASE_DELAY * Math.pow(2, metroTunnelAttempt - 1);
          setTimeout(startMetroTunnel, delay);
        } else {
          console.error(`${BOLD}\x1b[31m[metro-tunnel] Max retries exceeded. Metro tunnel unavailable.${RESET}`);
        }
      }
    });
    children.push(metroTunnel);

    let metroUrlFound = false;

    function onMetroTunnelUrl(metroTunnelUrl) {
      if (metroUrlFound) return;
      metroUrlFound = true;
      const metroPublicUrl = metroTunnelUrl.replace(/[)\],'"\s]+$/, "").trim();

      // Print connection info banner
      const hBar = "━".repeat(56);
      console.log("");
      console.log(`${BOLD}${CYAN}┏${hBar}┓${RESET}`);
      console.log(`${BOLD}${CYAN}┃${GREEN}${BOLD}  📱  Mobile App — Ready!                                ${CYAN}┃${RESET}`);
      console.log(`${BOLD}${CYAN}┣${hBar}┫${RESET}`);
      console.log(`${BOLD}${CYAN}┃${RESET}${WHITE}  Open Expo Go on your phone and tap "Enter URL manually" ${BOLD}${CYAN}┃${RESET}`);
      console.log(`${BOLD}${CYAN}┃${RESET}${WHITE}  then paste the URL below:                               ${BOLD}${CYAN}┃${RESET}`);
      console.log(`${BOLD}${CYAN}┗${hBar}┛${RESET}`);
      console.log("");
      console.log(`  ${BOLD}${YELLOW}${metroPublicUrl}${RESET}`);
      console.log("");
      console.log(`${DIM}  QR code (for quick copy — scan with any QR reader):${RESET}`);
      qrcode.generate(metroPublicUrl, { small: true }, (code) => {
        console.log(code);
      });

      // Start Expo with EXPO_PACKAGER_PROXY_URL so Metro's manifest
      // uses the cloudflare tunnel URL (not localhost:8081)
      run("mobile", npm, ["run", "-w", "mobile", "start"], {
        inherit: true,
        fatal: false,
        env: {
          ...process.env,
          EXPO_PUBLIC_SERVER_URL: apiTunnelUrl,
          EXPO_PUBLIC_CONNECTION_MODE: "cloudflare",
          EXPO_PACKAGER_PROXY_URL: metroPublicUrl,
        },
      });
    }

    const handleMetroOutput = (chunk) => {
      const line = String(chunk);
      process.stderr.write(`[metro-tunnel] ${line}`);
      const match = line.match(urlRegex);
      if (match) onMetroTunnelUrl(match[0]);
    };

    metroTunnel.stdout.setEncoding("utf8");
    metroTunnel.stderr.setEncoding("utf8");
    metroTunnel.stdout.on("data", handleMetroOutput);
    metroTunnel.stderr.on("data", handleMetroOutput);
  }

  startMetroTunnel();
}

function printExpoCommand(url) {
  const clean = url.replace(/[)\],'"\s]+$/, "").trim();
  if (tunnelUrlPrinted) return;
  tunnelUrlPrinted = true;

  // ANSI color codes
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";
  const CYAN = "\x1b[36m";
  const GREEN = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const WHITE = "\x1b[37m";
  const DIM = "\x1b[2m";

  if (noMobile) {
    // --no-mobile: print the command for the user to run manually
    const cmd = `EXPO_PUBLIC_SERVER_URL=${clean} npm run dev:mobile:cloudflare`;
    const header = " 🚀  EXPO TUNNEL COMMAND — Ready! ";
    const desc = " Copy & run the command below in another terminal: ";
    const w = Math.max(header.length, desc.length) + 2;

    const hBar = "━".repeat(w);
    const top = `┏${hBar}┓`;
    const mid = `┣${hBar}┫`;
    const bot = `┗${hBar}┛`;
    const pad = (s) => s + " ".repeat(Math.max(0, w - s.length));

    console.log("");
    console.log("");
    console.log(`${BOLD}${CYAN}${top}${RESET}`);
    console.log(`${BOLD}${CYAN}┃${GREEN}${BOLD}${pad(header)}${CYAN}┃${RESET}`);
    console.log(`${BOLD}${CYAN}${mid}${RESET}`);
    console.log(`${BOLD}${CYAN}┃${RESET}${WHITE}${pad(desc)}${BOLD}${CYAN}┃${RESET}`);
    console.log(`${BOLD}${CYAN}${bot}${RESET}`);
    console.log("");
    console.log(`  ${BOLD}${YELLOW}${cmd}${RESET}`);
    console.log("");
    console.log(`${DIM}  (triple-click the line above to select it)${RESET}`);
    console.log("");
    console.log("");
  } else {
    // Auto-launch mobile frontend with cloudflared Metro tunnel
    console.log("");
    console.log(`${BOLD}${GREEN} 🚀  API tunnel ready! Starting Metro tunnel...${RESET}`);
    console.log(`${DIM}     API URL: ${clean}${RESET}`);
    console.log("");
    startMobileFrontend(clean);
  }
}

// 3. Start sequence: Dev Server -> Wait -> Proxy -> Wait -> Cloudflare Tunnel
startDevServer();

waitForPort(PROXY_DEFAULT_TARGET_PORT, { label: "dev-server", timeoutMs: 30_000 })
  .then(() => {
    console.log(`\x1b[1m\x1b[32m ✓  Dev Server is ready on port ${PROXY_DEFAULT_TARGET_PORT}\x1b[0m`);

    // Start Proxy
    run("proxy", "node", ["server/utils/proxy.js"], { inherit: false });

    return waitForPort(TUNNEL_PROXY_PORT, { label: "proxy", timeoutMs: 30_000 });
  })
  .then(() => {
    console.log(`\x1b[1m\x1b[32m ✓  Proxy is ready on port ${TUNNEL_PROXY_PORT}\x1b[0m`);
    console.log(`\x1b[2m     Starting Cloudflare API tunnel...\x1b[0m\n`);

    const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--config", "/dev/null", "--url", `http://${PROXY_LOOPBACK_HOST}:${TUNNEL_PROXY_PORT}`], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
      env: process.env,
      detached: false,
    });
    child.on("error", (err) => console.error("[cloudflare] error:", err.message));
    child.on("exit", (code) => {
      if (code !== 0 && code != null) console.error("[cloudflare] exited with", code);
    });
    children.push(child);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const line = String(chunk);
      process.stdout.write(`[cloudflare] ${line}`);
      const match = line.match(urlRegex);
      if (match) printExpoCommand(match[0]);
    });
    child.stderr.on("data", (chunk) => {
      const line = String(chunk);
      process.stderr.write(`[cloudflare] ${line}`);
      const match = line.match(urlRegex);
      if (match) printExpoCommand(match[0]);
    });
  })
  .catch((err) => {
    console.error(`\x1b[1m\x1b[31m ✗  ${err.message}\x1b[0m`);
    console.error(`\x1b[2m     Server/Proxy did not start in time. Check for errors above.\x1b[0m\n`);
    killAll();
    process.exit(1);
  });

console.log("[dev:cloudflare] Proxy, dev server, and Cloudflare tunnel starting.");
if (noMobile) {
  console.log("[dev:cloudflare] Mobile frontend disabled (--no-mobile). The Expo command will be printed when the tunnel is ready.");
} else {
  console.log("[dev:cloudflare] Mobile frontend will auto-start when the tunnel URL is detected.");
}
console.log("");
