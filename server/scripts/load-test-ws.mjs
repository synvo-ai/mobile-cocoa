#!/usr/bin/env node
/**
 * load-test-ws.mjs — WebSocket Load Testing Script
 *
 * Simulates concurrent users hitting the WebSocket session streaming endpoint
 * through a Cloudflare tunnel. Measures connection times, message latency,
 * throughput, and error rates.
 *
 * Usage:
 *   node server/scripts/load-test-ws.mjs --url <CLOUDFLARE_URL>
 *   node server/scripts/load-test-ws.mjs --url <URL> --concurrency 10 --rounds 3
 *   node server/scripts/load-test-ws.mjs --url <URL> --ramp 1,5,10,20
 *   node server/scripts/load-test-ws.mjs --local  # hit localhost:3456 directly
 *
 * Options:
 *   --url <URL>            Cloudflare tunnel URL (required unless --local)
 *   --local                Hit localhost:3456 directly (for baseline comparison)
 *   --concurrency <N>      Number of concurrent sessions per round (default: 5)
 *   --rounds <N>           Number of rounds to run (default: 1)
 *   --ramp <n,n,n,...>     Ramp-up concurrency levels (overrides --concurrency/--rounds)
 *   --prompt <text>        Prompt to send (default: "Say hello in one sentence.")
 *   --timeout <seconds>    Per-session timeout (default: 120)
 *   --delay <ms>           Delay between launching each session in a round (default: 200)
 *   --provider <name>      AI provider to use (optional)
 *   --model <name>         AI model to use (optional)
 *   --skip-prompt          Skip sending a prompt; only test WS connect + history replay
 *   --json                 Output results as JSON (for piping to other tools)
 */

import WebSocket from "ws";

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);

const config = {
    url: null,
    local: false,
    concurrency: 5,
    rounds: 1,
    ramp: null,
    prompt: "Say hello in one sentence.",
    timeoutSec: 120,
    delayMs: 200,
    provider: null,
    model: null,
    skipPrompt: false,
    jsonOutput: false,
};

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case "--url": config.url = args[++i]; break;
        case "--local": config.local = true; break;
        case "--concurrency": config.concurrency = parseInt(args[++i], 10); break;
        case "--rounds": config.rounds = parseInt(args[++i], 10); break;
        case "--ramp": config.ramp = args[++i].split(",").map(Number); break;
        case "--prompt": config.prompt = args[++i]; break;
        case "--timeout": config.timeoutSec = parseInt(args[++i], 10); break;
        case "--delay": config.delayMs = parseInt(args[++i], 10); break;
        case "--provider": config.provider = args[++i]; break;
        case "--model": config.model = args[++i]; break;
        case "--skip-prompt": config.skipPrompt = true; break;
        case "--json": config.jsonOutput = true; break;
        default:
            if (!args[i].startsWith("--")) config.prompt = args[i];
    }
}

// ── Resolve base URL ────────────────────────────────────────────────────────
function getBaseUrl() {
    if (config.local) return "http://localhost:3456";
    if (config.url) return config.url.replace(/\/$/, "");
    console.error("Error: --url <CLOUDFLARE_URL> or --local is required.");
    process.exit(1);
}

function getWsUrl(baseUrl) {
    return baseUrl.replace(/^http/, "ws");
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const log = (tag, ...msg) => { if (!config.jsonOutput) console.log(`[${tag}]`, ...msg); };
const err = (tag, ...msg) => console.error(`[${tag}]`, ...msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hrMs = (start) => Number(((performance.now() - start)).toFixed(2));

const COLORS = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    blue: "\x1b[34m",
};

function colorize(color, text) {
    return config.jsonOutput ? text : `${COLORS[color]}${text}${COLORS.reset}`;
}

// ── API Interactions ────────────────────────────────────────────────────────
async function createSession(baseUrl) {
    const start = performance.now();
    const res = await fetch(`${baseUrl}/api/sessions/new`, { method: "POST" });
    if (!res.ok) throw new Error(`POST /api/sessions/new → ${res.status}`);
    const data = await res.json();
    if (!data.ok || !data.sessionId) throw new Error(`Bad response: ${JSON.stringify(data)}`);
    return { sessionId: data.sessionId, latencyMs: hrMs(start) };
}

async function sendPrompt(baseUrl, sessionId) {
    const start = performance.now();
    const body = { sessionId, prompt: config.prompt };
    if (config.provider) body.provider = config.provider;
    if (config.model) body.model = config.model;
    const res = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST /api/sessions → ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Prompt rejected: ${JSON.stringify(data)}`);
    return { activeSessionId: data.sessionId, latencyMs: hrMs(start) };
}

// ── WebSocket Stream Consumer ───────────────────────────────────────────────
function streamWs(wsBaseUrl, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
        const result = {
            connectLatencyMs: 0,
            firstMessageLatencyMs: 0,
            totalDurationMs: 0,
            messageCount: 0,
            totalBytes: 0,
            exitCode: null,
            error: null,
        };

        const overallStart = performance.now();
        const wsUrl = `${wsBaseUrl}/ws/sessions/${sessionId}/stream?activeOnly=1&skipReplay=1`;

        let ws;
        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            result.error = `WS constructor error: ${e.message}`;
            result.totalDurationMs = hrMs(overallStart);
            resolve(result);
            return;
        }

        const timer = setTimeout(() => {
            result.error = `Timeout after ${timeoutMs / 1000}s`;
            result.totalDurationMs = hrMs(overallStart);
            try { ws.close(); } catch { /* ignore */ }
            resolve(result);
        }, timeoutMs);

        let firstMessage = true;

        ws.on("open", () => {
            result.connectLatencyMs = hrMs(overallStart);
        });

        ws.on("message", (raw) => {
            const bytes = typeof raw === "string" ? Buffer.byteLength(raw) : raw.length;
            result.totalBytes += bytes;
            result.messageCount++;

            if (firstMessage) {
                result.firstMessageLatencyMs = hrMs(overallStart);
                firstMessage = false;
            }

            try {
                const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
                if (msg.event === "end") {
                    try {
                        const payload = JSON.parse(msg.data);
                        result.exitCode = payload.exitCode ?? null;
                    } catch { /* raw end */ }
                    result.totalDurationMs = hrMs(overallStart);
                    clearTimeout(timer);
                    ws.close();
                    resolve(result);
                }
            } catch { /* not JSON, continue */ }
        });

        ws.on("error", (e) => {
            result.error = e.message;
            result.totalDurationMs = hrMs(overallStart);
            clearTimeout(timer);
            resolve(result);
        });

        ws.on("close", () => {
            result.totalDurationMs = hrMs(overallStart);
            clearTimeout(timer);
            resolve(result);
        });
    });
}

// ── Single Session Test Run ─────────────────────────────────────────────────
async function runSingleSession(baseUrl, wsBaseUrl, index) {
    const metrics = {
        index,
        createSessionMs: 0,
        sendPromptMs: 0,
        wsConnectMs: 0,
        wsFirstMessageMs: 0,
        wsTotalMs: 0,
        wsMessages: 0,
        wsBytes: 0,
        exitCode: null,
        error: null,
        success: false,
    };

    try {
        // 1. Create session
        const { sessionId, latencyMs: createMs } = await createSession(baseUrl);
        metrics.createSessionMs = createMs;

        let activeId = sessionId;

        if (!config.skipPrompt) {
            // 2. Send prompt
            const { activeSessionId, latencyMs: promptMs } = await sendPrompt(baseUrl, sessionId);
            metrics.sendPromptMs = promptMs;
            activeId = activeSessionId;

            // Small delay for process to spawn
            await sleep(300);
        }

        // 3. Stream WS
        const wsResult = await streamWs(wsBaseUrl, activeId, config.timeoutSec * 1000);
        metrics.wsConnectMs = wsResult.connectLatencyMs;
        metrics.wsFirstMessageMs = wsResult.firstMessageLatencyMs;
        metrics.wsTotalMs = wsResult.totalDurationMs;
        metrics.wsMessages = wsResult.messageCount;
        metrics.wsBytes = wsResult.totalBytes;
        metrics.exitCode = wsResult.exitCode;
        metrics.error = wsResult.error;
        metrics.success = !wsResult.error;
    } catch (e) {
        metrics.error = e.message;
    }

    return metrics;
}

// ── Round Runner ────────────────────────────────────────────────────────────
async function runRound(baseUrl, wsBaseUrl, concurrency, roundNum) {
    log("round", colorize("cyan", `━━━ Round ${roundNum} ━━━ Concurrency: ${concurrency} ━━━`));

    const promises = [];
    for (let i = 0; i < concurrency; i++) {
        promises.push(runSingleSession(baseUrl, wsBaseUrl, i));
        if (i < concurrency - 1 && config.delayMs > 0) {
            await sleep(config.delayMs);
        }
    }

    const results = await Promise.all(promises);
    return results;
}

// ── Stats Aggregation ───────────────────────────────────────────────────────
function computeStats(results) {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const percentile = (arr, p) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    };

    const avg = (arr) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

    const createMs = successful.map((r) => r.createSessionMs);
    const promptMs = successful.map((r) => r.sendPromptMs);
    const wsConnectMs = successful.map((r) => r.wsConnectMs);
    const wsFirstMsgMs = successful.map((r) => r.wsFirstMessageMs);
    const wsTotalMs = successful.map((r) => r.wsTotalMs);
    const wsMessages = successful.map((r) => r.wsMessages);
    const wsBytes = successful.map((r) => r.wsBytes);

    return {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        errorRate: `${((failed.length / results.length) * 100).toFixed(1)}%`,
        errors: failed.map((r) => ({ index: r.index, error: r.error })),
        createSession: {
            avg: avg(createMs).toFixed(1),
            p50: percentile(createMs, 50).toFixed(1),
            p95: percentile(createMs, 95).toFixed(1),
            p99: percentile(createMs, 99).toFixed(1),
        },
        sendPrompt: {
            avg: avg(promptMs).toFixed(1),
            p50: percentile(promptMs, 50).toFixed(1),
            p95: percentile(promptMs, 95).toFixed(1),
            p99: percentile(promptMs, 99).toFixed(1),
        },
        wsConnect: {
            avg: avg(wsConnectMs).toFixed(1),
            p50: percentile(wsConnectMs, 50).toFixed(1),
            p95: percentile(wsConnectMs, 95).toFixed(1),
            p99: percentile(wsConnectMs, 99).toFixed(1),
        },
        wsFirstMessage: {
            avg: avg(wsFirstMsgMs).toFixed(1),
            p50: percentile(wsFirstMsgMs, 50).toFixed(1),
            p95: percentile(wsFirstMsgMs, 95).toFixed(1),
            p99: percentile(wsFirstMsgMs, 99).toFixed(1),
        },
        wsTotal: {
            avg: avg(wsTotalMs).toFixed(1),
            p50: percentile(wsTotalMs, 50).toFixed(1),
            p95: percentile(wsTotalMs, 95).toFixed(1),
            p99: percentile(wsTotalMs, 99).toFixed(1),
        },
        throughput: {
            avgMessages: avg(wsMessages).toFixed(1),
            avgBytes: avg(wsBytes).toFixed(0),
            totalMessages: wsMessages.reduce((a, b) => a + b, 0),
            totalBytes: wsBytes.reduce((a, b) => a + b, 0),
        },
    };
}

// ── Pretty Print ────────────────────────────────────────────────────────────
function printTable(label, obj) {
    const pad = (s, n) => String(s).padStart(n);
    console.log(colorize("bold", `  ${label}`));
    console.log(
        `    avg: ${pad(obj.avg, 8)}ms  ` +
        `p50: ${pad(obj.p50, 8)}ms  ` +
        `p95: ${pad(obj.p95, 8)}ms  ` +
        `p99: ${pad(obj.p99, 8)}ms`
    );
}

function printRoundResults(stats, roundLabel) {
    console.log();
    console.log(colorize("bold", `╔══════════════════════════════════════════════════════════╗`));
    console.log(colorize("bold", `║  ${roundLabel.padEnd(54)} ║`));
    console.log(colorize("bold", `╚══════════════════════════════════════════════════════════╝`));
    console.log();

    const successColor = stats.failed === 0 ? "green" : "yellow";
    console.log(
        `  Sessions: ${colorize("cyan", stats.total)} total, ` +
        `${colorize(successColor, stats.successful)} success, ` +
        `${stats.failed > 0 ? colorize("red", stats.failed) : stats.failed} failed ` +
        `(${stats.failed > 0 ? colorize("red", stats.errorRate) : colorize("green", stats.errorRate)} error rate)`
    );
    console.log();

    console.log(colorize("magenta", "  ── Latency Breakdown (ms) ──"));
    printTable("Create Session (HTTP POST)", stats.createSession);
    if (!config.skipPrompt) {
        printTable("Send Prompt    (HTTP POST)", stats.sendPrompt);
    }
    printTable("WS Connect     (upgrade) ", stats.wsConnect);
    printTable("WS First Msg   (TTFB)    ", stats.wsFirstMessage);
    printTable("WS Total       (e2e)     ", stats.wsTotal);

    console.log();
    console.log(colorize("magenta", "  ── Throughput ──"));
    console.log(
        `    avg msgs/session: ${colorize("cyan", stats.throughput.avgMessages)}  ` +
        `avg bytes/session: ${colorize("cyan", stats.throughput.avgBytes)}`
    );
    console.log(
        `    total msgs:       ${colorize("cyan", stats.throughput.totalMessages)}  ` +
        `total bytes:       ${colorize("cyan", stats.throughput.totalBytes)}`
    );

    if (stats.errors.length > 0) {
        console.log();
        console.log(colorize("red", "  ── Errors ──"));
        for (const e of stats.errors) {
            console.log(`    session[${e.index}]: ${colorize("red", e.error)}`);
        }
    }

    console.log();
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    const baseUrl = getBaseUrl();
    const wsBaseUrl = getWsUrl(baseUrl);

    if (!config.jsonOutput) {
        console.log();
        console.log(colorize("bold", "╔══════════════════════════════════════════════════════════╗"));
        console.log(colorize("bold", "║        WebSocket Load Test — Cloudflare Tunnel          ║"));
        console.log(colorize("bold", "╚══════════════════════════════════════════════════════════╝"));
        console.log();
        console.log(`  Target:      ${colorize("cyan", baseUrl)}`);
        console.log(`  WS URL:      ${colorize("cyan", wsBaseUrl)}`);
        console.log(`  Prompt:      ${colorize("dim", `"${config.prompt}"`)}`);
        console.log(`  Timeout:     ${config.timeoutSec}s per session`);
        console.log(`  Stagger:     ${config.delayMs}ms between launches`);
        if (config.skipPrompt) console.log(`  Mode:        ${colorize("yellow", "Connect-only (no prompt)")}`);
        console.log();
    }

    // Determine concurrency schedule
    const schedule = config.ramp
        ? config.ramp.map((c, i) => ({ concurrency: c, round: i + 1 }))
        : Array.from({ length: config.rounds }, (_, i) => ({
            concurrency: config.concurrency,
            round: i + 1,
        }));

    // Health check (non-fatal — Cloudflare tunnel may not expose this)
    log("preflight", "Running health check...");
    try {
        const hcRes = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10000) });
        if (!hcRes.ok) throw new Error(`Status ${hcRes.status}`);
        log("preflight", colorize("green", "✓ Server is healthy"));
    } catch (e) {
        err("preflight", colorize("yellow", `⚠ Health check inconclusive: ${e.message}`));
        err("preflight", "Proceeding anyway — tunnel may not expose /api/health.");
    }

    const allRoundStats = [];

    for (const { concurrency, round } of schedule) {
        const results = await runRound(baseUrl, wsBaseUrl, concurrency, round);
        const stats = computeStats(results);
        allRoundStats.push({ round, concurrency, stats, rawResults: results });

        if (!config.jsonOutput) {
            printRoundResults(stats, `Round ${round} — ${concurrency} concurrent sessions`);
        }

        // Cooldown between rounds
        if (round < schedule.length) {
            log("cooldown", "Cooling down for 2s...");
            await sleep(2000);
        }
    }

    // Summary across all rounds
    if (schedule.length > 1 && !config.jsonOutput) {
        console.log(colorize("bold", "╔══════════════════════════════════════════════════════════╗"));
        console.log(colorize("bold", "║              Ramp-Up Summary                             ║"));
        console.log(colorize("bold", "╚══════════════════════════════════════════════════════════╝"));
        console.log();
        console.log(
            "  " +
            "Round".padEnd(8) +
            "Conc".padEnd(8) +
            "OK".padEnd(6) +
            "Fail".padEnd(6) +
            "Err%".padEnd(8) +
            "Avg WS Connect".padEnd(18) +
            "Avg WS Total".padEnd(16)
        );
        console.log("  " + "─".repeat(66));
        for (const { round, concurrency, stats } of allRoundStats) {
            console.log(
                "  " +
                String(round).padEnd(8) +
                String(concurrency).padEnd(8) +
                colorize(stats.failed === 0 ? "green" : "yellow", String(stats.successful).padEnd(6)) +
                (stats.failed > 0 ? colorize("red", String(stats.failed).padEnd(6)) : String(stats.failed).padEnd(6)) +
                (stats.failed > 0 ? colorize("red", stats.errorRate.padEnd(8)) : stats.errorRate.padEnd(8)) +
                `${stats.wsConnect.avg}ms`.padEnd(18) +
                `${stats.wsTotal.avg}ms`.padEnd(16)
            );
        }
        console.log();
    }

    // JSON output
    if (config.jsonOutput) {
        console.log(JSON.stringify({
            config: {
                url: baseUrl,
                prompt: config.prompt,
                timeoutSec: config.timeoutSec,
                delayMs: config.delayMs,
                skipPrompt: config.skipPrompt,
            },
            rounds: allRoundStats.map(({ round, concurrency, stats }) => ({
                round,
                concurrency,
                ...stats,
            })),
        }, null, 2));
    }

    log("main", colorize("green", "✅ Load test complete!"));
    process.exit(0);
}

main().catch((e) => {
    err("fatal", e.message);
    process.exit(1);
});
