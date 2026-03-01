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
import { TUNNEL_PROXY_PORT, PROXY_LOOPBACK_HOST } from "../server/config/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

// 2. Dev server (port 3456) — background (OVERLAY_NETWORK=tunnel so server knows traffic goes via proxy)
setTimeout(() => {
  run("dev", npm, ["run", "dev"], { inherit: false, env: { ...process.env, OVERLAY_NETWORK: "tunnel" } });
}, 1500);

// 3. Cloudflare tunnel — foreground so user sees the URL; capture and print Expo command
const urlRegex = /https:\/\/[^\s"'<>]+\.(trycloudflare\.com|cfargotunnel\.com)[^\s"'<>]*/i;
let tunnelUrlPrinted = false;

function printExpoCommand(url) {
  const clean = url.replace(/[)\],'"\s]+$/, "").trim();
  if (tunnelUrlPrinted) return;
  tunnelUrlPrinted = true;
  console.log("");
  console.log("[dev:cloudflare] Run Expo with the tunnel URL (copy and run in another terminal):");
  console.log("");
  console.log(`  EXPO_PUBLIC_SERVER_URL=${clean} npm run dev:mobile:cloudflare`);
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
