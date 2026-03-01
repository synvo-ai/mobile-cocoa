#!/usr/bin/env node
/**
 * Start a Cloudflare quick tunnel so the mobile app can reach the local server from any network.
 *
 * Option A — main server only:
 *   CLOUDFLARE_TUNNEL_TARGET=http://localhost:3456 node scripts/start-cloudflare-tunnel.mjs
 *   Then set EXPO_PUBLIC_SERVER_URL to the printed URL (direct mode).
 *
 * Option B — proxy (API + preview via _targetPort):
 *   Ensure the local proxy is running: npm run proxy
 *   node scripts/start-cloudflare-tunnel.mjs
 *   Then set EXPO_PUBLIC_SERVER_URL to the printed URL and EXPO_PUBLIC_CONNECTION_MODE=cloudflare.
 *
 * Requires: cloudflared installed (e.g. brew install cloudflared).
 */
import { spawn } from "child_process";
import { CLOUDFLARE_TUNNEL_TARGET_TEMPLATE, TUNNEL_PROXY_PORT } from "../server/config/index.js";

const TARGET = process.env.CLOUDFLARE_TUNNEL_TARGET || CLOUDFLARE_TUNNEL_TARGET_TEMPLATE;

const child = spawn("cloudflared", ["tunnel", "--url", TARGET], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: false,
});

const urlRegex = /https:\/\/[^\s"'<>]+\.(trycloudflare\.com|cfargotunnel\.com)[^\s"'<>]*/i;

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

child.stdout.on("data", (chunk) => {
  const line = String(chunk);
  process.stdout.write(line);
  const match = line.match(urlRegex);
  if (match) {
    const url = match[0].replace(/[)\],'"\s]+$/, "").trim();
    console.error("\n---");
    console.error("Set in mobile app: EXPO_PUBLIC_SERVER_URL=" + url);
    if (TARGET.includes(String(TUNNEL_PROXY_PORT))) {
      console.error("Set in mobile app: EXPO_PUBLIC_CONNECTION_MODE=cloudflare");
    }
    console.error("---\n");
  }
});

child.stderr.on("data", (chunk) => {
  const line = String(chunk);
  process.stderr.write(line);
  const match = line.match(urlRegex);
  if (match) {
    const url = match[0].replace(/[)\],'"\s]+$/, "").trim();
    console.error("\n---");
    console.error("Set in mobile app: EXPO_PUBLIC_SERVER_URL=" + url);
    if (TARGET.includes(String(TUNNEL_PROXY_PORT))) {
      console.error("Set in mobile app: EXPO_PUBLIC_CONNECTION_MODE=cloudflare");
    }
    console.error("---\n");
  }
});

child.on("error", (err) => {
  console.error("Failed to run cloudflared:", err.message);
  console.error("Install it with: brew install cloudflared");
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});
process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
