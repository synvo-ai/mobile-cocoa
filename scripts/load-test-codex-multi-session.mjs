#!/usr/bin/env node
/**
 * Load Test: 10 Distinct Queries → Codex 5.3 in Separate Concurrent Sessions
 *
 * Fires 10 distinct prompts to gpt-5.3-codex simultaneously,
 * each in its own session, to stress-test multi-session concurrency.
 *
 * What it tests:
 * - 10 concurrent Pi RPC sessions running at the same time
 * - Each session receives only its own output (no cross-talk)
 * - All sessions complete with exit events
 * - Background streaming works for all sessions
 *
 * Usage:
 *   # Start server first:
 *   npm run dev
 *
 *   # Then run the load test:
 *   node scripts/load-test-codex-multi-session.mjs
 *
 *   # Override model (e.g. codex-mini):
 *   CODEX_MODEL=gpt-5.1-codex-mini node scripts/load-test-codex-multi-session.mjs
 *
 *   # Override server URL:
 *   SERVER_URL=http://192.168.1.100:3456 node scripts/load-test-codex-multi-session.mjs
 *
 *   # Adjust timeout (default 10 min):
 *   TIMEOUT_MS=900000 node scripts/load-test-codex-multi-session.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");

// ── Configuration ──────────────────────────────────────────────────────────
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3456";
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "600000", 10); // 10 min default
const STAGGER_MS = parseInt(process.env.STAGGER_MS || "1000", 10); // stagger start by 1s
const CWD_BASE = process.env.CWD_BASE || "/Users/yifanxu/machine_learning/LoVC/vce_test_space";

// ── 5 Diverse Queries across Claude, Antigravity, Codex ─────────────────────────
const PROMPTS = [
    {
        // CODING PROJECT: Full-stack todo app — Claude
        label: "Q01-TodoApp-Codex",
        provider: "codex",
        model: "gpt-5.3-codex",
        prompt: `Build a complete Todo application as a single-page HTML file called todo-app.html. It should be fully self-contained with inline CSS and JavaScript. Requirements:
1. A beautiful dark-themed UI with a gradient header, rounded cards for each todo, and smooth animations.
2. Features: add todos, mark complete (with strikethrough animation), delete (with fade-out), edit inline, filter by All/Active/Completed, clear completed button.
3. Persist todos in localStorage so they survive page refresh.
4. Show a count of remaining items. Add subtle hover effects on buttons and cards.
5. Use CSS transitions and transforms — no external libraries.
6. The design should feel premium: use a color palette of deep purple (#1a1a2e), accent blue (#e94560), and soft grays. Add box-shadows and glassmorphism effects.
7. Make it fully responsive — works on mobile and desktop.
Write the complete file. In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        // PUZZLE: Brain teasers — Antigravity
        label: "Q02-BrainTeasers-Codex",
        provider: "codex",
        model: "gpt-5.3-codex",
        prompt: `Create a file called brain-teasers.js that solves these classic puzzles programmatically. For each puzzle, implement the solution and print the answer with a clear explanation:

1. **River Crossing**: A farmer needs to cross a river with a wolf, a goat, and a cabbage. The boat fits only the farmer + one item. The wolf eats the goat if left alone, the goat eats the cabbage. Find the sequence of crossings using BFS.

2. **Einstein's Riddle**: There are 5 houses in a row, each a different color, with owners of different nationalities, drinks, cigarette brands, and pets. Given the 15 classic clues, determine who owns the fish. Solve with constraint satisfaction.

3. **Tower of Hanoi**: Solve for 6 disks and print each move. Count total moves and verify it equals 2^n - 1.

4. **Knight's Tour**: Find a valid Knight's Tour on an 8x8 chessboard using Warnsdorff's heuristic. Print the board showing visit order.

5. **Sudoku Solver**: Implement a backtracking Sudoku solver. Solve this puzzle:
   530070000, 600195000, 098000060, 800060003, 400803001, 700020006, 060000280, 000419005, 000080079
   Print the solved board.

6. **Water Jug Problem**: You have a 5-gallon and 3-gallon jug. Measure exactly 4 gallons using BFS to find the shortest sequence of operations.

Run all solutions when executed with node. In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        // CODING PROJECT: REST API server — Codex
        label: "Q03-RestApi-Codex",
        provider: "codex",
        model: "gpt-5.3-codex",
        prompt: `Create a complete REST API project with 3 files:

1. **server.js** — A Node.js HTTP server (no express, pure http module) that implements a JSON API for a "bookstore":
   - GET /api/books — list all books (supports ?genre= filter and ?sort=title|year query params)
   - GET /api/books/:id — get a single book
   - POST /api/books — add a book (validate: title, author, year, genre required)
   - PUT /api/books/:id — update a book
   - DELETE /api/books/:id — delete a book
   - GET /api/stats — return count by genre, average year, total books
   - Handle CORS headers, proper HTTP status codes (201, 400, 404, 405), JSON error responses.
   - Store data in memory with 10 pre-seeded books spanning different genres.

2. **test-api.js** — A test script that makes fetch() calls to test every endpoint and prints pass/fail results. Should test happy paths and error cases.

3. **README.md** — API documentation with endpoint table, request/response examples, and setup instructions.

Write all 3 files. In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        // UI: Animated landing page — Claude
        label: "Q04-LandingPage-Codex",
        provider: "codex",
        model: "gpt-5.3-codex",
        prompt: `Create a file called landing-page.html — a stunning, modern landing page for a fictional AI startup called "NeuralFlow". Single self-contained HTML file with inline CSS and JS. Requirements:

1. **Hero section**: Large animated gradient background that slowly shifts colors. Bold headline with a typewriter text animation cycling through: "Build Faster", "Think Deeper", "Ship Smarter". A glowing CTA button with pulse animation.

2. **Features section**: 3 feature cards with icons (use SVG icons inline), each card slides in from below on scroll using IntersectionObserver. Glassmorphism card style with backdrop-filter blur.

3. **Stats counter section**: Animated number counters (e.g. "10M+ API Calls", "50K+ Developers", "99.9% Uptime") that count up when scrolled into view.

4. **Testimonials**: A horizontal auto-scrolling carousel of 4 testimonial cards with avatar placeholders, quotes, and names.

5. **Pricing section**: 3 pricing tiers (Free, Pro, Enterprise) with the Pro tier highlighted/recommended. Hover effects that lift the cards.

6. **Footer**: Multi-column footer with links, social icons, and a newsletter signup input.

7. Use smooth scroll, dark theme, Inter font from Google Fonts, and ensure it's fully responsive.

Write the complete file. In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        // UI: Interactive dashboard — Antigravity
        label: "Q05-Dashboard-Codex",
        provider: "codex",
        model: "gpt-5.3-codex",
        prompt: `Create a file called dashboard.html — an analytics dashboard UI as a single self-contained HTML file. Requirements:

1. **Sidebar**: A collapsible sidebar (toggle with hamburger icon) with navigation items: Dashboard, Analytics, Users, Settings. Active item highlighted. Icons as inline SVGs.

2. **Top bar**: Shows page title, a search input, notification bell icon with a red badge showing "3", and a user avatar circle with dropdown menu.

3. **Stats row**: 4 stat cards showing: Total Revenue ($48,250), Active Users (2,847), Conversion Rate (3.6%), Avg Session (4m 32s). Each with a trend arrow (green up or red down) and percentage change.

4. **Chart area**: Create 2 charts using pure Canvas API (no chart libraries):
   - A line chart showing "Revenue over 12 months" with a gradient fill under the line, dots on data points with tooltips on hover.
   - A donut/ring chart showing "Traffic Sources" with 4 segments (Direct 35%, Search 30%, Social 20%, Referral 15%) with a legend.

5. **Recent activity table**: A table with 8 rows showing recent transactions: user name, action, amount, date, status badge (completed/pending/failed with colors).

6. **Design**: Dark theme using colors: background #0f0f23, cards #1a1a3e, accent #7c3aed (violet), text #e2e8f0. Smooth transitions everywhere. Glassmorphism on cards. Fully responsive — sidebar collapses to icons on smaller screens.

Write the complete file. In your final reply, include this exact verification token: {TOKEN}`,
    },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractText(parsed) {
    if (!parsed || typeof parsed !== "object") return "";
    if (parsed.assistantMessageEvent?.delta)
        return parsed.assistantMessageEvent.delta;
    if (parsed.assistantMessageEvent?.content)
        return String(parsed.assistantMessageEvent.content ?? "");
    if (parsed.result?.content) {
        const arr = Array.isArray(parsed.result.content)
            ? parsed.result.content
            : [];
        return arr
            .map((c) => c?.text ?? "")
            .filter(Boolean)
            .join("");
    }
    if (parsed.type === "message" && parsed.message?.content) {
        const arr = Array.isArray(parsed.message.content)
            ? parsed.message.content
            : [];
        return arr
            .filter((c) => c?.type === "text" && typeof c.text === "string")
            .map((c) => c.text)
            .join("");
    }
    return "";
}

async function setWorkspace(cwd) {
    const res = await fetch(`${SERVER_URL}/api/workspace-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: cwd }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST /api/workspace-path failed ${res.status}: ${text}`);
    }
}

async function submitPrompt(sessionId, provider, model, prompt) {
    const res = await fetch(`${SERVER_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, provider, model, prompt }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST /api/sessions failed ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Submit failed");
    return json.sessionId;
}

/**
 * Create SSE collector for a session. Returns { promise, liveState }.
 */
function createSseCollector(sessionId, token, label) {
    const liveState = {
        fullOutputLength: 0,
        startTime: Date.now(),
        firstChunkTime: null,
        events: 0,
    };

    const promise = new Promise((resolve) => {
        let fullOutput = "";
        let exitCode = null;
        let outputBuffer = "";
        let resolved = false;

        const url = `${SERVER_URL}/api/sessions/${encodeURIComponent(
            sessionId
        )}/stream`;
        const es = new EventSource(url);

        const finish = (err) => {
            if (resolved) return;
            resolved = true;
            try {
                es.close();
            } catch (_) { }
            resolve({
                label,
                token,
                fullOutput,
                exitCode,
                error: err,
                sessionId,
                stats: {
                    totalTimeMs: Date.now() - liveState.startTime,
                    timeToFirstChunkMs: liveState.firstChunkTime
                        ? liveState.firstChunkTime - liveState.startTime
                        : null,
                    totalEvents: liveState.events,
                    outputLength: fullOutput.length,
                },
            });
        };

        const timeout = setTimeout(() => {
            finish(`Timeout after ${TIMEOUT_MS / 1000}s`);
        }, TIMEOUT_MS);

        es.onmessage = (ev) => {
            // Record TTFC on the very first SSE payload, before any parsing
            if (!liveState.firstChunkTime) liveState.firstChunkTime = Date.now();
            const str =
                typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
            outputBuffer += str + "\n";
            const lines = outputBuffer.split("\n");
            outputBuffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                liveState.events++;
                try {
                    const parsed = JSON.parse(trimmed);
                    const text = extractText(parsed);
                    if (text) fullOutput += text;
                } catch {
                    fullOutput += trimmed + "\n";
                }
            }
            liveState.fullOutputLength = fullOutput.length;
        };

        es.addEventListener("end", (ev) => {
            try {
                const data = ev.data ? JSON.parse(ev.data) : {};
                exitCode = data.exitCode ?? 0;
            } catch (_) { }
            clearTimeout(timeout);
            finish();
        });

        es.onerror = () => {
            if (!resolved) {
                clearTimeout(timeout);
                finish("SSE connection error");
            }
        };
    });
    return { promise, liveState };
}

// ── Progress Reporter ───────────────────────────────────────────────────────

function startProgressReporter(liveStates, labels) {
    const interval = setInterval(() => {
        const progress = liveStates
            .map(
                (s, i) =>
                    `${labels[i]}: ${(s.fullOutputLength / 1024).toFixed(1)}KB (${s.events} events)`
            )
            .join(" | ");
        console.error(`[progress] ${progress}`);
    }, 5000); // report every 5s

    return () => clearInterval(interval);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const { mkdirSync } = await import("fs");

    console.error("╔════════════════════════════════════════════════════════════╗");
    console.error("║  LOAD TEST: 5 Queries → Codex                            ║");
    console.error("╚════════════════════════════════════════════════════════════╝");
    console.error(`  Server:   ${SERVER_URL}`);
    console.error(`  Providers: codex (gpt-5.3-codex)`);
    console.error(`  Timeout:  ${TIMEOUT_MS / 1000}s per session`);
    console.error(`  Stagger:  ${STAGGER_MS}ms between session starts`);
    console.error(`  CWD Base: ${CWD_BASE} (each session gets its own /1 .. /5)`);
    console.error("");

    // Create all 10 workspace directories
    for (let n = 1; n <= PROMPTS.length; n++) {
        const dir = `${CWD_BASE}/${n}`;
        try {
            mkdirSync(dir, { recursive: true });
        } catch (_) { /* ignore if exists */ }
    }
    console.error(`[setup] Created ${PROMPTS.length} workspace dirs: ${CWD_BASE}/1 .. ${CWD_BASE}/${PROMPTS.length}`);

    const collectors = [];
    const liveStates = [];
    const labels = [];
    const sessionTokens = [];
    const startTime = Date.now();

    // Fire all 5 sessions with slight stagger, each in its own workspace
    for (let i = 0; i < PROMPTS.length; i++) {
        const cfg = PROMPTS[i];
        const cwd = `${CWD_BASE}/${i + 1}`;
        const sessionId = crypto.randomUUID();
        const token = `LOADTEST_${i}_${Date.now()}`;
        const prompt = cfg.prompt.replace("{TOKEN}", token);

        labels.push(cfg.label);
        sessionTokens.push(token);

        // Set workspace for this session
        try {
            await setWorkspace(cwd);
            console.error(`[${cfg.label}] Workspace set to: ${cwd}`);
        } catch (err) {
            console.error(`[${cfg.label}] WARNING: Failed to set workspace: ${err.message}`);
        }

        console.error(
            `[${cfg.label}] Submitting [${cfg.provider}/${cfg.model}]... (session: ${sessionId.slice(0, 20)}...)`
        );

        try {
            await submitPrompt(sessionId, cfg.provider, cfg.model, prompt);
            console.error(`[${cfg.label}] ✓ Submitted [${cfg.provider}/${cfg.model}]`);
        } catch (err) {
            console.error(`[${cfg.label}] ✗ Submit FAILED: ${err.message}`);
            collectors.push(
                Promise.resolve({
                    label: cfg.label,
                    token,
                    fullOutput: "",
                    exitCode: null,
                    error: `Submit failed: ${err.message}`,
                    sessionId,
                    stats: { totalTimeMs: 0, timeToFirstChunkMs: null, totalEvents: 0, outputLength: 0 },
                })
            );
            liveStates.push({ fullOutputLength: 0, events: 0 });
            continue;
        }

        const { promise, liveState } = createSseCollector(sessionId, token, cfg.label);
        collectors.push(promise);
        liveStates.push(liveState);

        // Stagger next session start
        if (i < PROMPTS.length - 1 && STAGGER_MS > 0) {
            await new Promise((r) => setTimeout(r, STAGGER_MS));
        }
    }

    console.error("");
    console.error(
        `[load-test] All ${collectors.length} sessions launched. Waiting for completion...`
    );
    console.error(`[load-test] Progress updates every 5 seconds:\n`);

    // Start progress reporter
    const stopProgress = startProgressReporter(liveStates, labels);

    // Wait for all to complete
    const results = await Promise.all(collectors);
    stopProgress();

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── Results Report ──────────────────────────────────────────────────────
    console.error("\n╔════════════════════════════════════════════════════════════╗");
    console.error("║                    RESULTS SUMMARY                       ║");
    console.error("╚════════════════════════════════════════════════════════════╝\n");

    let allPassed = true;
    const allTokens = results.map((r) => r.token).filter(Boolean);

    for (const r of results) {
        const hasOwnToken = r.token && r.fullOutput.includes(r.token);
        const hasCrossTalk = allTokens.some(
            (t) => t !== r.token && r.fullOutput.includes(t)
        );
        const gotExit = r.exitCode !== null;
        const noError = !r.error;
        const hasContent = r.fullOutput.length > 100;

        const ok = noError && gotExit && hasContent && !hasCrossTalk;
        if (!ok) allPassed = false;

        const status = ok ? "✅ PASS" : "❌ FAIL";
        const s = r.stats;

        console.error(`  ${status}  ${r.label}`);
        console.error(
            `         Time: ${(s.totalTimeMs / 1000).toFixed(1)}s | TTFC: ${s.timeToFirstChunkMs ? (s.timeToFirstChunkMs / 1000).toFixed(1) + "s" : "N/A"} | Events: ${s.totalEvents} | Output: ${(s.outputLength / 1024).toFixed(1)}KB`
        );

        if (r.error) console.error(`         Error: ${r.error}`);
        if (hasCrossTalk) console.error(`         ⚠️  CROSS-TALK detected!`);
        if (!gotExit) console.error(`         ⚠️  No exit event received`);
        if (!hasContent)
            console.error(
                `         ⚠️  Output too short (${r.fullOutput.length} chars)`
            );
        if (hasOwnToken) console.error(`         ✓ Verification token found`);
        else console.error(`         ○ Verification token not found (optional)`);

        // Output preview
        const preview = r.fullOutput
            .slice(0, 120)
            .replace(/\n/g, " ")
            .trim();
        if (preview) console.error(`         Preview: "${preview}..."`);
        console.error("");
    }

    // ── Aggregate Stats ──────────────────────────────────────────────────────
    const successCount = results.filter((r) => !r.error && r.exitCode !== null).length;
    const totalOutput = results.reduce((sum, r) => sum + (r.stats?.outputLength ?? 0), 0);
    const totalEvents = results.reduce((sum, r) => sum + (r.stats?.totalEvents ?? 0), 0);
    const avgTime = results.filter((r) => r.stats?.totalTimeMs > 0).length > 0
        ? (results.reduce((sum, r) => sum + (r.stats?.totalTimeMs ?? 0), 0) /
            results.filter((r) => r.stats?.totalTimeMs > 0).length / 1000).toFixed(1)
        : "N/A";

    console.error("─────────────────────────────────────────────────────────────");
    console.error(`  Total elapsed:      ${totalElapsed}s (wall clock)`);
    console.error(`  Sessions:           ${successCount}/${results.length} completed`);
    console.error(`  Avg session time:   ${avgTime}s`);
    console.error(`  Total output:       ${(totalOutput / 1024).toFixed(1)}KB`);
    console.error(`  Total SSE events:   ${totalEvents}`);
    console.error(`  Providers:          codex`);
    console.error("─────────────────────────────────────────────────────────────\n");

    if (allPassed) {
        console.error("🎉 LOAD TEST PASSED — All 5 sessions completed successfully.");
        console.error("   Concurrency is working correctly.\n");
        process.exit(0);
    } else {
        console.error("⚠️  LOAD TEST HAD FAILURES — Check individual results above.\n");
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("[load-test] Fatal error:", err);
    process.exit(1);
});
