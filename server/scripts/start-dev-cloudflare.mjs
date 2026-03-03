#!/usr/bin/env node
/**
 * Option B: Start proxy + dev server + Cloudflare tunnel in one go.
 * When the tunnel prints a URL, use it with:
 *   EXPO_PUBLIC_SERVER_URL=https://YOUR_URL npm run dev:mobile:cloudflare
 *
 * Requires: cloudflared (e.g. brew install cloudflared).
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { TUNNEL_PROXY_PORT, PROXY_LOOPBACK_HOST } from "../config/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

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
run("proxy", "node", ["server/utils/proxy.js"], { inherit: false });

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

setTimeout(startDevServer, 1500);

// 3. Cloudflare tunnel — foreground so user sees the URL; capture and print Expo command
const urlRegex = /https:\/\/[^\s"'<>]+\.(trycloudflare\.com|cfargotunnel\.com)[^\s"'<>]*/i;
let tunnelUrlPrinted = false;

function printExpoCommand(url) {
  const clean = url.replace(/[)\],'"\s]+$/, "").trim();
  if (tunnelUrlPrinted) return;
  tunnelUrlPrinted = true;

  const cmd = `EXPO_PUBLIC_SERVER_URL=${clean} npm run dev:mobile:cloudflare`;

  // ANSI color codes
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";
  const CYAN = "\x1b[36m";
  const GREEN = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const WHITE = "\x1b[37m";
  const DIM = "\x1b[2m";

  // Header / description text
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
}

setTimeout(() => {
  const child = spawn("cloudflared", ["tunnel", "--url", `http://${PROXY_LOOPBACK_HOST}:${TUNNEL_PROXY_PORT}`], {
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
}, 3000);

console.log("[dev:cloudflare] Proxy, dev server, and Cloudflare tunnel starting.");
console.log("[dev:cloudflare] When the tunnel URL appears below, the Expo command will be printed.");
console.log("");
