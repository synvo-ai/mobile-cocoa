import fs from "fs";
import path from "path";
import { getWorkspaceCwd, SESSIONS_ROOT } from "../config/index.js";
import { resolveSession } from "../sessionRegistry.js";

/** Extract content from Pi message content array. Thinking uses c.thinking, text uses c.text. */
export function extractMessageContent(contentArr) {
    if (!Array.isArray(contentArr)) return "";
    return contentArr
        .filter((c) => c && (c.type === "text" || c.type === "thinking"))
        .map((c) => {
            if (c.type === "thinking" && typeof c.thinking === "string") return `<think>\n${c.thinking}\n</think>\n\n`;
            if (c.type === "text" && typeof c.text === "string") return c.text;
            return "";
        })
        .filter(Boolean)
        .join("");
}

/** Extract canonical session UUID from filename stem (e.g. 2026-02-22T..._9176cf21-... -> 9176cf21-...) */
export function uuidFromFileStem(stem) {
    const idx = stem.lastIndexOf("_");
    return idx >= 0 ? stem.slice(idx + 1) : stem;
}

/** Map Pi CLI provider string to app provider (claude, gemini, codex). */
export function mapProvider(providerStr) {
    if (!providerStr || typeof providerStr !== "string") return null;
    const s = providerStr.toLowerCase();
    if (s.includes("gemini")) return "gemini";
    if (s.includes("claude") || s.includes("anthropic")) return "claude";
    if (s.includes("codex") || s.includes("openai")) return "codex";
    return null;
}

export function normalizeProvider(providerStr) {
    if (providerStr === "claude" || providerStr === "gemini" || providerStr === "codex") {
        return providerStr;
    }
    return "codex";
}

/** Derive cwd from session file path. Returns null when file is in central SESSIONS_ROOT (no workspace in path). */
export function deriveCwdFromFilePath(filePath) {
    const dir = path.dirname(filePath);
    const parent = path.dirname(dir);
    if (path.basename(parent) === ".pi") return path.dirname(parent);
    if (path.basename(parent) === "agent") return null; // central .pi/agent/sessions - no workspace in path
    return parent;
}

/** Parse JSONL to extract session id, first user input, cwd, and last model_change (provider, modelId). */
export function parseSessionMetadata(filePath) {
    let sessionId = null;
    let firstUserInput = null;
    let provider = null;
    let modelId = null;
    let cwd = null;
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const lines = raw.split("\n").filter((l) => l.trim());
        for (const line of lines) {
            try {
                const obj = JSON.parse(line);
                if (obj.type === "session" && typeof obj.id === "string") {
                    sessionId = obj.id;
                    if (typeof obj.cwd === "string" && obj.cwd) cwd = obj.cwd;
                }
                if (obj.type === "model_change" && typeof obj.modelId === "string") {
                    provider = mapProvider(obj.provider) || provider;
                    modelId = obj.modelId;
                }
                if ((obj.type === "message" || obj.type === "message_start") && obj.message?.role === "user" && firstUserInput == null) {
                    const content = obj.message.content;
                    if (Array.isArray(content)) {
                        const textParts = content
                            .filter((c) => c?.type === "text" && typeof c.text === "string")
                            .map((c) => c.text);
                        firstUserInput = textParts.join("").trim().slice(0, 80) || null;
                    } else if (typeof content === "string") {
                        firstUserInput = content.trim().slice(0, 80) || null;
                    }
                    break; // found first user message
                }
            } catch (_) {
                /* skip malformed lines */
            }
        }
        if (!cwd) cwd = deriveCwdFromFilePath(filePath);
    } catch (e) {
        console.error("[sessions] Failed to parse metadata:", filePath, e?.message);
    }
    return { sessionId, firstUserInput, provider, modelId, cwd };
}

/** Session dir = sessions/{sessionId}. Dir name is just the session id. */
export function getSessionDir(sessionId) {
    return path.join(SESSIONS_ROOT, "sessions", sessionId);
}

/** Find .jsonl file in a session dir. */
export function findJsonlInDir(dir) {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir);
    const jsonl = entries.find((n) => n.endsWith(".jsonl"));
    return jsonl ? path.join(dir, jsonl) : null;
}

/** Resolve session file path. Session dir is sessions/{sessionId}. */
export function resolveSessionFilePath(sessionId) {
    return findJsonlInDir(getSessionDir(sessionId));
}

export function listDiscoveredSessions() {
    const sessionsBase = path.join(SESSIONS_ROOT, "sessions");
    if (!fs.existsSync(sessionsBase)) return [];

    const subdirs = fs.readdirSync(sessionsBase, { withFileTypes: true }).filter((e) => e.isDirectory());
    const discovered = [];
    for (const d of subdirs) {
        const dirSessionId = d.name;
        const filePath = findJsonlInDir(path.join(sessionsBase, dirSessionId));
        if (!filePath) continue;

        const stat = fs.statSync(filePath);
        const fileStem = path.basename(filePath, ".jsonl");
        const metadata = parseSessionMetadata(filePath);
        const id = metadata.sessionId || dirSessionId;
        const activeSession = resolveSession(id);
        discovered.push({
            id,
            filePath,
            fileStem,
            mtimeMs: stat.mtimeMs,
            firstUserInput: metadata.firstUserInput,
            provider: metadata.provider,
            modelId: metadata.modelId,
            cwd: metadata.cwd,
            activeSession,
        });
    }

    discovered.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return discovered;
}

/** Staleness threshold (ms): sessions not modified within this window are considered idling. */
export const STALE_SESSION_MS = 60_000; // 1 minute

/**
 * Returns the effective running status of a session record,
 * treating stale sessions (no agent_end, file untouched > 1 min) as idling.
 */
export function resolveSessionRunning(record, now) {
    const running = record.activeSession?.processManager?.processRunning?.() ?? false;
    if (running && (now - record.mtimeMs) > STALE_SESSION_MS) return false;
    return running;
}

/** Create initial session file. Always uses sessions/{sessionId}/. */
export function createNewSessionFile(sessionId, cwd) {
    const sessionDir = getSessionDir(sessionId);
    try {
        fs.mkdirSync(sessionDir, { recursive: true });
    } catch (_) { }
    const iso = new Date().toISOString().replace(/:/g, "-").replace(".", "-");
    const fileName = `${iso}_${sessionId}.jsonl`;
    const filePath = path.join(sessionDir, fileName);
    const header = JSON.stringify({
        type: "session",
        version: 3,
        id: sessionId,
        timestamp: new Date().toISOString(),
        cwd,
    }) + "\n";
    fs.writeFileSync(filePath, header, "utf-8");
    return filePath;
}

/**
 * Strip heavy snapshot/lifecycle events during SSE replay to prevent
 * xhr.responseText from growing unboundedly on the mobile client.
 * Returns the line unchanged if it's not a heavy event.
 */
export function slimReplayLine(line) {
    // Fast regex checks before any JSON.parse
    if (/"type"\s*:\s*"(message_end|turn_end|message_start)"/.test(line)) {
        // Extract just the type and return a tiny event
        const typeMatch = line.match(/"type"\s*:\s*"([^"]+)"/);
        return JSON.stringify({ type: typeMatch?.[1] ?? "unknown" });
    }
    // Large "message" events with assistant content — check size before stripping
    if (/"type"\s*:\s*"message"/.test(line) && line.length > 2048) {
        try {
            const parsed = JSON.parse(line);
            if (parsed.message?.role === "assistant") {
                return JSON.stringify({ type: "message", id: parsed.id, parentId: parsed.parentId, timestamp: parsed.timestamp, message: { role: "assistant", content: "[stripped]" } });
            }
        } catch { }
    }
    return line;
}

/**
 * Replay session history from a JSONL file to an SSE response.
 * Skips agent lifecycle events and slims heavy content to prevent
 * unbounded xhr.responseText growth on the mobile client.
 * @returns {number} Number of lines replayed
 */
export function replayHistoryToResponse(filePath, res) {
    if (!filePath || !fs.existsSync(filePath)) return 0;
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const lines = raw.split("\n").filter((l) => l.trim());
        for (const line of lines) {
            if (/\"type\"\s*:\s*\"agent_(end|start)\"/.test(line)) continue;
            const slimmed = slimReplayLine(line);
            res.write(`data: ${slimmed}\n\n`);
        }
        return lines.length;
    } catch (e) {
        console.error("[sessions] Failed to replay history from disk:", e?.message);
        return 0;
    }
}
