import fs from "fs";
import path from "path";
import { getWorkspaceCwd, SESSIONS_ROOT, VALID_PROVIDERS, DEFAULT_PROVIDER } from "../config/index.js";
import { resolveSession } from "../sessionRegistry.js";

/** Version written into each new session JSONL header. Increment on schema changes. */
const SESSION_FILE_VERSION = 3;
/** Max characters to preview for the first user message in session listings. */
const FIRST_USER_INPUT_MAX_LEN = 80;
/** Byte threshold above which assistant message events are stripped during SSE replay. */
const SLIM_REPLAY_THRESHOLD_BYTES = 2048;
/** Restrictive single-segment session ID format to prevent path traversal. */
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidSessionId(sessionId) {
    if (typeof sessionId !== "string") return false;
    const trimmedSessionId = sessionId.trim();
    if (!trimmedSessionId || trimmedSessionId === "." || trimmedSessionId === "..") return false;
    if (trimmedSessionId.includes("/") || trimmedSessionId.includes("\\")) return false;
    return SAFE_SESSION_ID_RE.test(trimmedSessionId);
}

export function assertValidSessionId(sessionId) {
    if (!isValidSessionId(sessionId)) {
        throw new Error("Invalid sessionId");
    }
    return sessionId.trim();
}

/** Extract content from Pi message content array. Thinking uses c.thinking, text uses c.text. */
function extractMessageContent(contentItems) {
    if (!Array.isArray(contentItems)) return "";
    return contentItems
        .filter((contentItem) => contentItem && (contentItem.type === "text" || contentItem.type === "thinking"))
        .map((contentItem) => {
            if (contentItem.type === "thinking" && typeof contentItem.thinking === "string") return `<think>\n${contentItem.thinking}\n</think>\n\n`;
            if (contentItem.type === "text" && typeof contentItem.text === "string") return contentItem.text;
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
function mapProvider(providerStr) {
    if (!providerStr || typeof providerStr !== "string") return null;
    const providerLower = providerStr.toLowerCase();
    if (providerLower.includes("gemini")) return "gemini";
    if (providerLower.includes("claude") || providerLower.includes("anthropic")) return "claude";
    if (providerLower.includes("codex") || providerLower.includes("openai")) return "codex";
    return null;
}

export function normalizeProvider(providerStr) {
    if (VALID_PROVIDERS.includes(providerStr)) {
        return providerStr;
    }
    return DEFAULT_PROVIDER;
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
        const jsonlText = fs.readFileSync(filePath, "utf-8");
        const lines = jsonlText.split("\n").filter((lineText) => lineText.trim());
        for (const line of lines) {
            try {
                const parsedLine = JSON.parse(line);
                if (parsedLine.type === "session" && typeof parsedLine.id === "string") {
                    sessionId = parsedLine.id;
                    if (typeof parsedLine.cwd === "string" && parsedLine.cwd) cwd = parsedLine.cwd;
                }
                if (parsedLine.type === "model_change" && typeof parsedLine.modelId === "string") {
                    provider = mapProvider(parsedLine.provider) || provider;
                    modelId = parsedLine.modelId;
                }
                if ((parsedLine.type === "message" || parsedLine.type === "message_start") && parsedLine.message?.role === "user" && firstUserInput == null) {
                    const content = parsedLine.message.content;
                    if (Array.isArray(content)) {
                        const textParts = content
                            .filter((contentItem) => contentItem?.type === "text" && typeof contentItem.text === "string")
                            .map((contentItem) => contentItem.text);
                        firstUserInput = textParts.join("").trim().slice(0, FIRST_USER_INPUT_MAX_LEN) || null;
                    } else if (typeof content === "string") {
                        firstUserInput = content.trim().slice(0, FIRST_USER_INPUT_MAX_LEN) || null;
                    }
                    break; // found first user message
                }
            } catch (_) {
                /* skip malformed lines */
            }
        }
        if (!cwd) cwd = deriveCwdFromFilePath(filePath);
    } catch (error) {
        console.error("[sessions] Failed to parse metadata:", filePath, error?.message);
    }
    return { sessionId, firstUserInput, provider, modelId, cwd };
}

/** Session dir = sessions/{sessionId}. Dir name is just the session id. */
export function getSessionDir(sessionId) {
    const validatedSessionId = assertValidSessionId(sessionId);
    return path.join(SESSIONS_ROOT, "sessions", validatedSessionId);
}

/** Find .jsonl file in a session dir. */
export function findJsonlInDir(dir) {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir);
    const jsonlFileName = entries.find((entryName) => entryName.endsWith(".jsonl"));
    return jsonlFileName ? path.join(dir, jsonlFileName) : null;
}

/** Resolve session file path. Session dir is sessions/{sessionId}. */
export function resolveSessionFilePath(sessionId) {
    return findJsonlInDir(getSessionDir(sessionId));
}

export function listDiscoveredSessions() {
    const sessionsBase = path.join(SESSIONS_ROOT, "sessions");
    if (!fs.existsSync(sessionsBase)) return [];

    const subdirs = fs.readdirSync(sessionsBase, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const discovered = [];
    for (const sessionDirEntry of subdirs) {
        const dirSessionId = sessionDirEntry.name;
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
const STALE_SESSION_MS = 60_000; // 1 minute

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
        version: SESSION_FILE_VERSION,
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
function slimReplayLine(line) {
    // Fast regex checks before any JSON.parse
    if (/"type"\s*:\s*"(message_end|turn_end|message_start)"/.test(line)) {
        // Extract just the type and return a tiny event
        const typeMatch = line.match(/"type"\s*:\s*"([^"]+)"/);
        return JSON.stringify({ type: typeMatch?.[1] ?? "unknown" });
    }
    // Large "message" events with assistant content — check size before stripping
    if (/"type"\s*:\s*"message"/.test(line) && line.length > SLIM_REPLAY_THRESHOLD_BYTES) {
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
        const jsonlText = fs.readFileSync(filePath, "utf-8");
        const lines = jsonlText.split("\n").filter((lineText) => lineText.trim());
        for (const line of lines) {
            if (/\"type\"\s*:\s*\"agent_(end|start)\"/.test(line)) continue;
            const slimmed = slimReplayLine(line);
            res.write(`data: ${slimmed}\n\n`);
        }
        return lines.length;
    } catch (error) {
        console.error("[sessions] Failed to replay history from disk:", error?.message);
        return 0;
    }
}

/**
 * Parse a session JSONL file into an array of {id, role, content} message objects.
 * Handles streaming deltas (Codex/Claude), thinking blocks, deduplication, and flush.
 * @param {string} filePath - Absolute path to the .jsonl session file
 * @returns {{ id: string, role: string, content: string }[]}
 */
export function parseMessagesFromJsonl(filePath) {
    const jsonlText = fs.readFileSync(filePath, "utf-8");
    const lines = jsonlText.split("\n").filter((lineText) => lineText.trim());

    const messages = [];
    const seenUserMessageIds = new Set();
    const seenUserMessageContents = new Set();
    let nextMessageIndex = 0;
    let pendingAssistantContent = [];
    let pendingDeltaText = "";

    for (const line of lines) {
        try {
            const parsedEvent = JSON.parse(line);
            if (!parsedEvent) continue;

            // ── Handle message_update streaming deltas ───────────────
            // Providers like Codex/Claude stream via message_update events with
            // assistantMessageEvent deltas rather than complete message objects.
            if (parsedEvent.type === "message_update" && parsedEvent.assistantMessageEvent) {
                const assistantMessageEvent = parsedEvent.assistantMessageEvent;
                // Regular text deltas (Codex uses "text_delta")
                if ((assistantMessageEvent.type === "text_delta" || assistantMessageEvent.type === "delta") && typeof assistantMessageEvent.delta === "string") {
                    pendingDeltaText += assistantMessageEvent.delta;
                }
                // Claude-style content_block_delta with nested text
                if (assistantMessageEvent.type === "content_block_delta" && typeof assistantMessageEvent.delta?.text === "string") {
                    pendingDeltaText += assistantMessageEvent.delta.text;
                }
                // Thinking blocks — reconstruct <think>...</think> wrappers
                if (assistantMessageEvent.type === "thinking_start") pendingDeltaText += "<think>\n";
                if (assistantMessageEvent.type === "thinking_delta" && typeof assistantMessageEvent.delta === "string") pendingDeltaText += assistantMessageEvent.delta;
                if (assistantMessageEvent.type === "thinking_end") pendingDeltaText += "\n</think>\n\n";
                continue;
            }

            // ── Handle standard message/message_start/message_end ────
            if (!["message", "message_start", "message_end"].includes(parsedEvent.type) || !parsedEvent.message) continue;

            const messagePayload = parsedEvent.message;
            const role = messagePayload.role;
            if (role !== "user" && role !== "assistant") continue;
            if (role === "assistant" && (!messagePayload.content || messagePayload.content.length === 0)) continue;

            const contentStr = extractMessageContent(messagePayload.content).trim();
            if (!contentStr) continue;

            if (role === "user") {
                // Flush any accumulated delta text before the user message
                if (pendingDeltaText) {
                    pendingAssistantContent.push(pendingDeltaText);
                    pendingDeltaText = "";
                }
                // Prefer event message ID for dedupe; fallback to content only when no id is present.
                const messageId = typeof messagePayload.id === "string" && messagePayload.id.trim().length > 0 ? messagePayload.id.trim() : "";
                if (messageId) {
                    if (seenUserMessageIds.has(messageId)) continue;
                    seenUserMessageIds.add(messageId);
                } else {
                    if (seenUserMessageContents.has(contentStr)) continue;
                    seenUserMessageContents.add(contentStr);
                }

                // Flush pending assistant chunks
                if (pendingAssistantContent.length > 0) {
                    messages.push({ id: `msg-${++nextMessageIndex}`, role: "assistant", content: pendingAssistantContent.join("\n\n").trim() });
                    pendingAssistantContent = [];
                }
                messages.push({ id: `msg-${++nextMessageIndex}`, role: "user", content: contentStr });
            } else {
                // role === 'assistant': flush delta text then accumulate
                if (pendingDeltaText) {
                    pendingAssistantContent.push(pendingDeltaText);
                    pendingDeltaText = "";
                }
                pendingAssistantContent.push(contentStr);
            }
        } catch (_) {
            /* skip malformed lines */
        }
    }

    // Final flush
    if (pendingDeltaText) pendingAssistantContent.push(pendingDeltaText);
    if (pendingAssistantContent.length > 0) {
        messages.push({ id: `msg-${++nextMessageIndex}`, role: "assistant", content: pendingAssistantContent.join("\n\n").trim() });
    }

    return messages;
}
