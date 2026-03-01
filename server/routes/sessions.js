import crypto from "crypto";
import { Router } from "express";
import fs from "fs";
import path from "path";
import {
  DEFAULT_PROVIDER,
  DEFAULT_PROVIDER_MODELS,
  getWorkspaceCwd,
  SESSIONS_ROOT,
  WORKSPACE_ALLOWED_ROOT,
} from "../config/index.js";
import { formatSessionLogTimestamp } from "../process/index.js";
import { createSession, getSession, removeSession, resolveSession, subscribeToSession } from "../sessionRegistry.js";
import {
    extractMessageContent,
    uuidFromFileStem,
    mapProvider,
    normalizeProvider,
    deriveCwdFromFilePath,
    parseSessionMetadata,
    listDiscoveredSessions,
    resolveSessionRunning,
    getSessionDir,
    findJsonlInDir,
    resolveSessionFilePath,
    createNewSessionFile,
    slimReplayLine,
    replayHistoryToResponse
} from "./sessionHelpers.js";

const DEFAULT_SESSION_PROVIDER = DEFAULT_PROVIDER;
const DEFAULT_SESSION_MODEL = DEFAULT_PROVIDER_MODELS?.[DEFAULT_SESSION_PROVIDER];

export function registerSessionsRoutes(app) {
    const router = Router();

    // GET /api/sessions/status - Session status list for client UI
    router.get("/status", (_, res) => {
        const discovered = [];
        try {
            const records = listDiscoveredSessions();
            if (!records.length) {
                return res.json({ ok: true, sessions: discovered, projectRootPath: getWorkspaceCwd() });
            }

            const now = Date.now();
            for (const record of records) {
                const running = resolveSessionRunning(record, now);
                discovered.push({
                    id: record.id,
                    cwd: (typeof record.cwd === "string" && record.cwd.trim()) ? record.cwd : null,
                    model: record.modelId || null,
                    lastAccess: record.mtimeMs,
                    status: running ? "running" : "idling",
                    title: record.firstUserInput || "(no input)",
                });
            }
        } catch (e) {
            console.error("[sessions] Failed to list .pi/agent/sessions for status:", e?.message);
        }
        res.json({ ok: true, sessions: discovered, projectRootPath: getWorkspaceCwd() });
    });

    // POST /api/sessions/new - Initialize a new session and return a real sessionId.
    router.post("/new", (req, res) => {
        const sessionId = crypto.randomUUID();
        const filePath = createNewSessionFile(sessionId, getWorkspaceCwd());
        const session = createSession(sessionId, DEFAULT_SESSION_PROVIDER, DEFAULT_SESSION_MODEL, {
            existingSessionPath: filePath,
            sessionLogTimestamp: formatSessionLogTimestamp(),
        });
        session.sessionLogTimestamp = formatSessionLogTimestamp();
        res.status(200).json({ sessionId, ok: true });
    });

    // GET /api/sessions - List sessions. Each subdir of sessions/ is session id; discover by id.
    router.get("/", (req, res) => {
        const discovered = [];
        try {
            const records = listDiscoveredSessions();
            if (!records.length) {
                return res.json({ sessions: discovered, projectRootPath: getWorkspaceCwd() });
            }

            const now = Date.now();
            for (const record of records) {
                const sseConnected = record.activeSession ? record.activeSession.subscribers?.size > 0 : false;
                const running = resolveSessionRunning(record, now);
                const resolvedCwd = (typeof record.cwd === "string" && record.cwd.trim())
                    ? record.cwd
                    : (deriveCwdFromFilePath(record.filePath) || getWorkspaceCwd());
                discovered.push({
                    id: record.id,
                    fileStem: record.fileStem,
                    firstUserInput: record.firstUserInput || "(no input)",
                    provider: record.provider || null,
                    model: record.modelId || null,
                    mtime: record.mtimeMs,
                    sseConnected,
                    running,
                    cwd: resolvedCwd || getWorkspaceCwd(),
                });
            }
        } catch (e) {
            console.error("[sessions] Failed to list .pi/agent/sessions:", e?.message);
        }
        res.json({ sessions: discovered, projectRootPath: getWorkspaceCwd() });
    });

    // POST /api/sessions
    // Submit prompt and create or update session. Requires sessionId (from POST /api/sessions/new).
    router.post("/", (req, res) => {
        const payload = req.body;
        const provider = normalizeProvider(payload?.provider);
        const model = payload.model;
        const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
        // Per-session workspace: use payload.cwd if provided, otherwise fall back to global.
        const sessionCwd = (typeof payload?.cwd === "string" && payload.cwd.trim()) ? payload.cwd.trim() : getWorkspaceCwd();

        if (!prompt) {
            res.status(400).json({ ok: false, error: "Prompt cannot be empty" });
            return;
        }

        let sessionId = payload.sessionId;
        if (!sessionId || typeof sessionId !== "string" || sessionId.startsWith("temp-")) {
            sessionId = null;
        }

        let session = sessionId ? getSession(sessionId) : null;
        if (!session || payload.replaceRunning) {
            if (session) {
                removeSession(sessionId);
            }
            if (!sessionId) {
                sessionId = crypto.randomUUID();
            }
            let existingPath = resolveSessionFilePath(sessionId);
            if (!existingPath) {
                existingPath = createNewSessionFile(sessionId, sessionCwd);
            }
            // Write the user prompt to the JSONL immediately so parseSessionMetadata
            // and GET /messages can find it during streaming (Pi may not log the user
            // message until thousands of streaming events later).
            try {
                const userMsgLine = JSON.stringify({
                    type: "message",
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    message: {
                        role: "user",
                        content: [{ type: "text", text: prompt }],
                    },
                }) + "\n";
                fs.appendFileSync(existingPath, userMsgLine, "utf-8");
            } catch (_) { /* non-fatal */ }
            session = createSession(sessionId, provider, model, {
                existingSessionPath: existingPath,
                sessionLogTimestamp: formatSessionLogTimestamp(),
            });
            session.sessionLogTimestamp = formatSessionLogTimestamp();
        } else {
            // Update provider/model if changed
            session.provider = provider;
            session.model = model;
        }

        // Process manager logic
        try {
            session.processManager.handleSubmitPrompt(payload, req.headers.host);
            res.status(200).json({ sessionId, ok: true });
        } catch (err) {
            // Include sessionId so client can connect to stream even on error (process may have partially started)
            res.status(500).json({ ok: false, error: err.message, sessionId });
        }
    });

    // POST /api/sessions/destroy-workspace - Delete all sessions for a workspace (and their session folders)
    router.post("/destroy-workspace", (req, res) => {
        const rawPath = req.body?.path ?? req.query?.path;
        const targetPath = (typeof rawPath === "string" && rawPath.trim())
            ? path.resolve(rawPath.trim())
            : getWorkspaceCwd();
        if (!targetPath.startsWith(WORKSPACE_ALLOWED_ROOT)) {
            return res.status(400).json({ error: "Path must be under allowed root" });
        }
        const sessionsBase = path.join(SESSIONS_ROOT, "sessions");
        let deletedCount = 0;
        try {
            if (!fs.existsSync(sessionsBase)) {
                return res.json({ ok: true, deletedCount: 0 });
            }
            const subdirs = fs.readdirSync(sessionsBase, { withFileTypes: true }).filter((e) => e.isDirectory());
            for (const d of subdirs) {
                const sessionId = d.name;
                const filePath = findJsonlInDir(path.join(sessionsBase, sessionId));
                if (!filePath) continue;
                const { cwd } = parseSessionMetadata(filePath);
                const derived = deriveCwdFromFilePath(filePath);
                const resolvedCwd = (typeof cwd === "string" && cwd.trim())
                    ? path.resolve(cwd)
                    : (derived ? path.resolve(derived) : null);
                if (resolvedCwd !== targetPath) continue;
                try {
                    const activeSession = resolveSession(sessionId);
                    if (activeSession) removeSession(activeSession.id);
                    const sessionDir = getSessionDir(sessionId);
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true });
                        deletedCount++;
                    }
                } catch (e) {
                    console.error("[sessions] Failed to delete session folder for destroy-workspace:", sessionId, e?.message);
                }
            }
            res.json({ ok: true, deletedCount });
        } catch (e) {
            console.error("[sessions] Failed to destroy workspace sessions:", targetPath, e?.message);
            res.status(500).json({ error: "Failed to destroy workspace sessions" });
        }
    });

    // POST /api/sessions/:sessionId/input
    router.post("/:sessionId/input", (req, res) => {
        const session = getSession(req.params.sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        session.processManager.handleInput(req.body);
        res.json({ ok: true });
    });

    // POST /api/sessions/:sessionId/terminate
    router.post("/:sessionId/terminate", (req, res) => {
        const session = getSession(req.params.sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        session.processManager.handleTerminate({ resetSession: req.body.resetSession });
        res.json({ ok: true });
    });

    // POST /api/sessions/:sessionId/finished - Client notifies that it has observed the session as idle/finished
    router.post("/:sessionId/finished", (req, res) => {
        const { sessionId } = req.params;
        const activeSession = resolveSession(sessionId);
        if (activeSession) {
            // Optional: server could update last-seen-idle or clear client state here
        }
        res.json({ ok: true });
    });

    // GET /api/sessions/:sessionId/messages - Load messages from central .pi/agent/sessions
    router.get("/:sessionId/messages", (req, res) => {
        const { sessionId } = req.params;
        const filePath = resolveSessionFilePath(sessionId);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Session not found" });
        }
        const canonicalSessionId = uuidFromFileStem(path.basename(filePath, ".jsonl"));
        try {
            const raw = fs.readFileSync(filePath, "utf-8");
            const lines = raw.split("\n").filter((l) => l.trim());

            const messages = [];
            let idx = 0;
            let pendingAssistantContent = [];
            // Accumulates text from message_update streaming deltas (e.g. Codex, Claude).
            // These are small fragments that must be concatenated to reconstruct the full
            // assistant message when the session file only contains streaming events so far.
            let pendingDeltaText = "";

            for (const line of lines) {
                try {
                    const obj = JSON.parse(line);
                    if (!obj) continue;

                    // ── Handle message_update streaming deltas ───────────────
                    // Providers like Codex stream assistant content as message_update
                    // events with assistantMessageEvent deltas, rather than emitting
                    // a complete message/message_end with full content.
                    if (obj.type === "message_update" && obj.assistantMessageEvent) {
                        const evt = obj.assistantMessageEvent;
                        // Regular text deltas (main response content — Codex uses "text_delta")
                        if ((evt.type === "text_delta" || evt.type === "delta") && typeof evt.delta === "string") {
                            pendingDeltaText += evt.delta;
                        }
                        // Claude-style content_block_delta with nested text
                        if (evt.type === "content_block_delta" && typeof evt.delta?.text === "string") {
                            pendingDeltaText += evt.delta.text;
                        }
                        // Thinking blocks — reconstruct the <think>...</think> wrappers
                        // to match the format the mobile eventDispatcher produces during live streaming.
                        if (evt.type === "thinking_start") {
                            pendingDeltaText += "<think>\n";
                        }
                        if (evt.type === "thinking_delta" && typeof evt.delta === "string") {
                            pendingDeltaText += evt.delta;
                        }
                        if (evt.type === "thinking_end") {
                            pendingDeltaText += "\n</think>\n\n";
                        }
                        continue;
                    }

                    // ── Handle standard message/message_start/message_end ────
                    if (
                        !["message", "message_start", "message_end"].includes(obj.type) ||
                        !obj.message
                    )
                        continue;

                    const m = obj.message;
                    const role = m.role;

                    // Ensure we only process valid roles
                    if (role !== "user" && role !== "assistant") continue;

                    // Skip assistant message start/end/regular if content array is empty (which happens with streaming sometimes)
                    if (role === "assistant" && (!m.content || m.content.length === 0))
                        continue;

                    // Check if there is actual content after extraction
                    const contentStr = extractMessageContent(m.content).trim();
                    if (!contentStr) continue;

                    if (role === "user") {
                        // Flush any accumulated delta text before the user message
                        if (pendingDeltaText) {
                            pendingAssistantContent.push(pendingDeltaText);
                            pendingDeltaText = "";
                        }

                        // Deduplicate: skip if any existing user message already has this content.
                        // This handles: (a) repeated message_start/message_end/message events for
                        // the same turn, and (b) Pi re-logging the user message after we pre-wrote
                        // it to the JSONL at session creation time.
                        const isDuplicate = messages.some(
                            (m) => m.role === "user" && m.content === contentStr
                        );
                        if (isDuplicate) continue;

                        // A user message flushes any pending assistant chunks into a new assistant message
                        if (pendingAssistantContent.length > 0) {
                            messages.push({
                                id: `msg-${++idx}`,
                                role: "assistant",
                                content: pendingAssistantContent.join("\n\n").trim(),
                            });
                            pendingAssistantContent = []; // reset for the next assistant turn
                        }

                        messages.push({
                            id: `msg-${++idx}`,
                            role: "user",
                            content: contentStr,
                        });
                    } else {
                        // role === 'assistant'
                        // Flush any accumulated delta text into assistant content first
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

            // Flush any remaining delta text
            if (pendingDeltaText) {
                pendingAssistantContent.push(pendingDeltaText);
                pendingDeltaText = "";
            }
            if (pendingAssistantContent.length > 0) {
                messages.push({
                    id: `msg-${++idx}`,
                    role: "assistant",
                    content: pendingAssistantContent.join("\n\n").trim(),
                });
            }
            const { provider, modelId, cwd } = parseSessionMetadata(filePath);
            const activeSession = resolveSession(sessionId) || resolveSession(canonicalSessionId);
            const running = activeSession?.processManager?.processRunning?.() ?? false;
            const sseConnected = activeSession ? activeSession.subscribers?.size > 0 : false;
            // When session is running, registry may have migrated to a different id (e.g. Pi session_id).
            // Return that id so the client connects to the correct stream and does not open a duplicate that gets "end".
            const activeSessionId = activeSession?.id ?? canonicalSessionId;
            res.json({
                messages,
                sessionId: canonicalSessionId,
                activeSessionId: running || sseConnected ? activeSessionId : undefined,
                provider: provider || null,
                model: modelId || null,
                running,
                sseConnected,
                cwd: cwd || getWorkspaceCwd(),
            });
        } catch (e) {
            console.error("[sessions] Failed to load messages:", e?.message);
            res.status(500).json({ error: "Failed to load session" });
        }
    });

    // DELETE /api/sessions/:sessionId - Remove session folder and clean up active registry
    router.delete("/:sessionId", (req, res) => {
        const { sessionId } = req.params;
        const sessionDir = getSessionDir(sessionId);
        if (!fs.existsSync(sessionDir)) {
            return res.status(404).json({ error: "Session not found" });
        }
        try {
            const activeSession = resolveSession(sessionId);
            if (activeSession) {
                removeSession(activeSession.id);
            }
            fs.rmSync(sessionDir, { recursive: true });
            res.json({ ok: true });
        } catch (e) {
            console.error("[sessions] Failed to delete session folder:", sessionDir, e?.message);
            res.status(500).json({ error: "Failed to delete session" });
        }
    });

    // GET /api/sessions/:sessionId/stream
    router.get("/:sessionId/stream", async (req, res) => {
        const sessionId = req.params.sessionId;
        const session = resolveSession(sessionId);

        // Setup SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        if (!session) {
            // Session not in registry (e.g. server restarted). Try to replay history from disk
            // before closing the connection so the client can restore its message history.
            const skipReplay = req.query.skipReplay === "1" || req.query.skipReplay === "true";
            if (!skipReplay && !sessionId.startsWith("temp-")) {
                const filePath = resolveSessionFilePath(sessionId);
                replayHistoryToResponse(filePath, res);
            }
            res.write(`event: end\ndata: {"exitCode": 0}\n\n`);
            res.end();
            return;
        }

        const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
        const skipReplay = req.query.skipReplay === "1" || req.query.skipReplay === "true";
        const processRunning = session.processManager.processRunning?.() || false;
        let sentLines = 0;
        // Replay history from disk unless client already has it (skipReplay=1 when resuming with preseeded messages)
        if (!skipReplay && !sessionId.startsWith("temp-")) {
            const filePath = session.existingSessionPath && fs.existsSync(session.existingSessionPath)
                ? session.existingSessionPath
                : resolveSessionFilePath(sessionId);
            sentLines = replayHistoryToResponse(filePath, res);
        }
        if (activeOnly && !processRunning) {
            // Race: mobile connects before Pi emits agent_start. Poll briefly for process to start.
            const maxWaitMs = 6000;
            const pollMs = 150;
            const start = Date.now();
            let done = false;
            req.on("close", () => {
                done = true;
                session.subscribers.delete(res);
            });
            const check = () => {
                if (done || res.writableEnded) return;
                if (session.processManager.processRunning?.()) {
                    done = true;
                    session.subscribers.add(res);
                    if (process.env.DEBUG_SSE) {
                        console.log(`[SSE] sessionId=${sessionId} process started after ${Date.now() - start}ms, subscribed`);
                    }
                    return;
                }
                if (Date.now() - start >= maxWaitMs) {
                    done = true;
                    res.write(`event: end\ndata: {"exitCode": 0}\n\n`);
                    res.end();
                    return;
                }
                setTimeout(check, pollMs);
            };
            setTimeout(check, pollMs);
            return;
        }

        // Subscribe to live events
        subscribeToSession(sessionId, res);
        if (process.env.DEBUG_SSE) {
            console.log(`[SSE] subscribed sessionId=${sessionId}, total subscribers=${session.subscribers.size}`);
        }

        req.on("close", () => {
            // Use session ref directly (survives migrate to Pi's native session_id)
            session.subscribers.delete(res);
        });
    });

    app.use("/api/sessions", router);
}
