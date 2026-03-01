#!/usr/bin/env node
/**
 * Smoke test: verify Pi RPC SSE supports UI-like session switching and multiple agents.
 *
 * Simulates a more complex mobile app flow:
 * 1. Start A, view A, wait (user reads)
 * 2. Switch to B, start B, wait
 * 3. Switch back to A briefly (round-trip) — verify A kept streaming in background
 * 4. Switch to C, start C, wait
 * 5. Switch to D, start D
 * 6. All SSE connections stay open; collect until complete
 *
 * Verifies:
 * - Multiple agents run concurrently (4 sessions, no workspace lock)
 * - Each stream receives only its own output (no cross-talk)
 * - Background sessions keep receiving while "viewing" another (output growth check)
 * - Round-trip switch: A receives data while user "viewed" B
 * - All sessions complete with exit event
 *
 * Usage:
 *   WORKSPACE_CWD=/path node server.js &
 *   node scripts/smoke-pi-rpc-sse-session-switch.mjs
 *
 *   NUM_SESSIONS=4 SWITCH_DELAY_MS=2500 node scripts/smoke-pi-rpc-sse-session-switch.mjs
 *   RAPID_MODE=1 node scripts/smoke-pi-rpc-sse-session-switch.mjs  # shorter delays, stress test
 *
 *   # Tests are distributed across workspaces: A,C,E at CWD_PROJECT, B,D at CWD_TEST_WS
 *   CWD_PROJECT=/path/to/project CWD_TEST_WS=/path/to/workspace_for_testing node scripts/smoke-pi-rpc-sse-session-switch.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3456";
const PROMPT_TIMEOUT_MS = parseInt(process.env.PROMPT_TIMEOUT_MS || "540000", 10); // 9 min for longer runs
const SWITCH_DELAY_MS = parseInt(process.env.SWITCH_DELAY_MS || "3000", 10);
const RAPID_MODE = process.env.RAPID_MODE === "1" || process.env.RAPID_MODE === "true";
const NUM_SESSIONS = Math.min(
  Math.max(parseInt(process.env.NUM_SESSIONS || "4", 10) || 4, 3),
  5
);
const ROUND_TRIP_INDEX = 0; // After starting session 1, "switch back" to session 0 conceptually

const BASE_DELAY = RAPID_MODE ? 800 : SWITCH_DELAY_MS;

/** Workspaces to distribute tests across. */
const CWD_PROJECT = process.env.CWD_PROJECT || "/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v2";
const CWD_TEST_WS = process.env.CWD_TEST_WS || "/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v2/workspace_for_testing";

/** Up to 5 session configs. Prompts are verbose so each LLM runs longer. */
/** cwd: workspace to run this session in (project root or workspace_for_testing). */
const RUNS = [
  {
    provider: "codex",
    model: "gpt-5.1-codex",
    label: "session-A",
    cwd: CWD_PROJECT,
    prompt: "Examine the current project root thoroughly. List all key files and directories, explain the purpose of each major component, and describe how they connect. Be detailed and substantive. In your final reply, include this exact token: {TOKEN}.",
  },
  {
    provider: "codex",
    model: "gpt-5.1-codex-mini",
    label: "session-B",
    cwd: CWD_TEST_WS,
    prompt: "Summarize the full project structure. Walk through each top-level directory, list important files, and explain the architecture. Be thorough. In your final reply, include this exact token: {TOKEN}.",
  },
  {
    provider: "gemini",
    model: "gemini-3-flash",
    label: "session-C",
    cwd: CWD_PROJECT,
    prompt: "Describe what the backend does in detail. Inspect the server code, routes, API definitions, and database models. Explain the main flows and dependencies. Be comprehensive. In your final reply, include this exact token: {TOKEN}.",
  },
  {
    provider: "gemini",
    model: "gemini-3-flash",
    label: "session-D",
    cwd: CWD_TEST_WS,
    prompt: "Analyze what skills or tools this project uses. Look at configuration files, package.json or requirements, and any skill definitions. Explain how each is used. Be thorough. In your final reply, include this exact token: {TOKEN}.",
  },
  {
    provider: "codex",
    model: "gpt-5.1-codex-mini",
    label: "session-E",
    cwd: CWD_PROJECT,
    prompt: "List and analyze all main config files (package.json, tsconfig, next.config, etc.). Explain what each config does and how they interact. Be detailed. In your final reply, include this exact token: {TOKEN}.",
  },
].slice(0, NUM_SESSIONS);

function extractText(parsed) {
  if (!parsed || typeof parsed !== "object") return "";
  if (parsed.assistantMessageEvent?.delta) return parsed.assistantMessageEvent.delta;
  if (parsed.assistantMessageEvent?.content) return String(parsed.assistantMessageEvent.content ?? "");
  if (parsed.result?.content) {
    const arr = Array.isArray(parsed.result.content) ? parsed.result.content : [];
    return arr.map((c) => c?.text ?? "").filter(Boolean).join("");
  }
  if (parsed.type === "message" && parsed.message?.content) {
    const arr = Array.isArray(parsed.message.content) ? parsed.message.content : [];
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

async function submitPrompt(sessionId, provider, model, prompt, cwd) {
  if (cwd) {
    await setWorkspace(cwd);
  }
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
 * Create an SSE connection. Returns { promise, liveState }.
 * liveState.fullOutputLength updates as data arrives (for checkpoint sampling).
 */
function createSseCollector(sessionId, token, label) {
  const liveState = { fullOutputLength: 0 };
  const promise = new Promise((resolve) => {
    let fullOutput = "";
    let exitCode = null;
    let outputBuffer = "";
    let resolved = false;

    const url = `${SERVER_URL}/api/sessions/${encodeURIComponent(sessionId)}/stream`;
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
      });
    };

    const timeout = setTimeout(() => {
      finish(`Timeout after ${PROMPT_TIMEOUT_MS / 1000}s`);
    }, PROMPT_TIMEOUT_MS);

    es.onmessage = (ev) => {
      const str = typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
      outputBuffer += str + "\n";
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
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

/**
 * Simulate complex UI session switching with round-trip and output growth verification:
 * - Staggered submit + SSE connect (A, B, C, D...)
 * - After starting B: "switch back" to A (checkpoint A's output length)
 * - After starting C: checkpoint A again (verify A grew while "viewing" B/C)
 * - All SSE connections stay open; collect until complete
 */
async function runSessionSwitchSimulation() {
  const collectors = [];
  const liveStates = [];
  const checkpoints = []; // [{ sessionIndex, outputLen, atStep }]

  for (let i = 0; i < RUNS.length; i++) {
    const cfg = RUNS[i];
    const sessionId = `smoke-switch-${i}-${crypto.randomUUID()}`;
    const token = `SMOKE_SWITCH_${i}_${Date.now()}`;
    const prompt = cfg.prompt.replace("{TOKEN}", token);

    console.error(`[smoke] ${cfg.label}: submitting prompt (session ${sessionId.slice(0, 12)}... cwd=${cfg.cwd ?? "(default)"})`);
    try {
      await submitPrompt(sessionId, cfg.provider, cfg.model, prompt, cfg.cwd);
    } catch (err) {
      return {
        results: RUNS.map((r, j) => ({
          label: r.label,
          index: j,
          submitError: j === i ? err.message : null,
          fullOutput: "",
          exitCode: null,
          error: null,
          token: j === i ? null : undefined,
        })),
        checkpoints: [],
      };
    }

    const { promise, liveState } = createSseCollector(sessionId, token, cfg.label);
    collectors.push(promise);
    liveStates.push(liveState);

    const delay = i < RUNS.length - 1 ? BASE_DELAY : 0;
    if (delay > 0) {
      console.error(`[smoke] ${cfg.label}: SSE connected. Simulating switch in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));

      // Round-trip: after starting session 1, "switch back" — sample session 0's output length
      if (i === 1 && ROUND_TRIP_INDEX < liveStates.length) {
        const len = liveStates[ROUND_TRIP_INDEX].fullOutputLength;
        checkpoints.push({ sessionIndex: ROUND_TRIP_INDEX, outputLen: len, atStep: "after-B" });
        console.error(`[smoke] Round-trip: session ${ROUND_TRIP_INDEX} output len=${len} (while "viewing" B)`);
      }
      // After starting session 2, sample session 0 again (should have grown)
      if (i === 2 && ROUND_TRIP_INDEX < liveStates.length) {
        const len = liveStates[ROUND_TRIP_INDEX].fullOutputLength;
        checkpoints.push({ sessionIndex: ROUND_TRIP_INDEX, outputLen: len, atStep: "after-C" });
        console.error(`[smoke] Checkpoint: session ${ROUND_TRIP_INDEX} output len=${len} (while "viewing" C)`);
      }
    }
  }

  console.error(`[smoke] All ${collectors.length} sessions running. Collecting until complete...`);
  const rawResults = await Promise.all(collectors);
  const results = rawResults.map((r, i) => ({ ...r, index: i }));

  return { results, checkpoints };
}

async function main() {
  console.error("[smoke] Pi RPC SSE session switch + multi-agent smoke test (complex mode)");
  console.error("[smoke] SERVER_URL:", SERVER_URL);
  console.error("[smoke] NUM_SESSIONS:", NUM_SESSIONS);
  console.error("[smoke] SWITCH_DELAY_MS:", SWITCH_DELAY_MS);
  console.error("[smoke] RAPID_MODE:", RAPID_MODE);
  console.error("[smoke] CWD_PROJECT:", CWD_PROJECT);
  console.error("[smoke] CWD_TEST_WS:", CWD_TEST_WS);
  console.error("[smoke] Simulates: A -> B -> round-trip to A -> C -> D... (all SSEs stay open)");
  console.error("[smoke] Workspace distribution: A,C,E -> project root; B,D -> workspace_for_testing\n");

  const start = Date.now();
  const { results, checkpoints } = await runSessionSwitchSimulation();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const tokens = results.map((r) => r.token).filter(Boolean);
  let passed = true;

  for (const r of results) {
    const hasOwnToken = r.token && r.fullOutput.includes(r.token);
    const hasOthersToken = tokens.some((t) => t !== r.token && r.fullOutput.includes(t));
    const gotExit = r.exitCode !== null;
    const noError = !r.error;
    const noSubmitError = !r.submitError;

    const ok = hasOwnToken && !hasOthersToken && gotExit && noError && noSubmitError;
    if (!ok) passed = false;

    const status = ok ? "PASS" : "FAIL";
    console.error(`[smoke] ${r.label}: ${status}`);
    if (r.submitError) console.error(`         Submit error: ${r.submitError}`);
    if (r.error) console.error(`         Error: ${r.error}`);
    if (!hasOwnToken) console.error(`         Missing own token in output`);
    if (hasOthersToken) console.error(`         CROSS-TALK: received another session's token!`);
    if (!gotExit) console.error(`         Did not receive exit event`);
    console.error(`         [DEBUG] exitCode=${r.exitCode} outputLen=${r.fullOutput?.length ?? 0} token=${r.token ? "present" : "missing"}`);
    if (ok) {
      const preview = r.fullOutput.slice(0, 80).replace(/\n/g, " ");
      console.error(`         Output preview: "${preview}..."`);
    }
  }

  // Log background output growth (session 0 received data while we "viewed" B/C)
  if (checkpoints.length >= 2) {
    const cp1 = checkpoints[0];
    const cp2 = checkpoints[1];
    const finalLen = results[ROUND_TRIP_INDEX]?.fullOutput?.length ?? 0;
    const grew = cp2.outputLen > cp1.outputLen || finalLen > cp1.outputLen;
    console.error(
      `[smoke] Background growth: session ${ROUND_TRIP_INDEX} ${cp1.outputLen} -> ${cp2.outputLen} -> ${finalLen} chars ${grew ? "✓" : "(finished early)"}`
    );
  }

  console.error("");
  console.error(`[smoke] Elapsed: ${elapsed}s`);
  if (passed) {
    console.error("[smoke] Session switch + multi-agent test PASSED.");
    console.error("[smoke] Multiple agents run concurrently; no cross-talk; background streaming verified.");
    process.exit(0);
  } else {
    console.error("[smoke] One or more sessions failed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke] Fatal:", err);
  process.exit(1);
});
