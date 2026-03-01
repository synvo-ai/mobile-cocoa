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
    uuidFromFileStem,
    normalizeProvider,
    deriveCwdFromFilePath,
    parseSessionMetadata,
    listDiscoveredSessions,
    resolveSessionRunning,
    getSessionDir,
    findJsonlInDir,
    resolveSessionFilePath,
    createNewSessionFile,
    replayHistoryToResponse,
    parseMessagesFromJsonl,
    assertValidSessionId,
    isValidSessionId,
} from "./sessionHelpers.js";

const DEFAULT_SESSION_PROVIDER = DEFAULT_PROVIDER;
const DEFAULT_SESSION_MODEL = DEFAULT_PROVIDER_MODELS?.[DEFAULT_SESSION_PROVIDER];

/** Maximum ms to wait for an agent process to start before sending SSE end. */
const SSE_PROCESS_START_WAIT_MS = 6_000;
/** Interval in ms to poll for process start during active-only SSE connections. */
const SSE_PROCESS_START_POLL_MS = 150;

const WORKSPACE_ALLOWED_ROOT_REAL = (() => {
    try {
        return fs.realpathSync(WORKSPACE_ALLOWED_ROOT);
    } catch {
        return path.resolve(WORKSPACE_ALLOWED_ROOT);
    }
})();

function isInsideRoot(rootDir, targetPath) {
    const rel = path.relative(rootDir, targetPath);
    return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

function requireValidSessionIdParam(req, res) {
    try {
        return assertValidSessionId(req.params.sessionId);
    } catch {
        res.status(400).json({ error: "Invalid sessionId" });
        return null;
    }
}

/**
 * Find an existing session or create (and optionally replace) one.
 * Writes the user prompt to the JSONL immediately so GET /messages can find it
 * during streaming — Pi may not log the user message until many events later.
 * @returns {{ session: object, sessionId: string }}
 */
function findOrCreateSession(payload, provider, model, prompt, sessionCwd) {
    let sessionId = null;
    if (typeof payload?.sessionId === "string" && payload.sessionId.trim()) {
        const candidate = payload.sessionId.trim();
        if (!candidate.startsWith("temp-")) {
            sessionId = assertValidSessionId(candidate);
        }
    }

    let session = sessionId ? getSession(sessionId) : null;

    if (!session || payload.replaceRunning) {
        if (session) removeSession(sessionId);
        if (!sessionId) sessionId = crypto.randomUUID();

        let existingPath = resolveSessionFilePath(sessionId);
        if (!existingPath) existingPath = createNewSessionFile(sessionId, sessionCwd);

        // Pre-write the user prompt to the JSONL so parseSessionMetadata
        // and GET /messages can surface it immediately during streaming.
        try {
            const userMsgLine = JSON.stringify({
                type: "message",
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                message: { role: "user", content: [{ type: "text", text: prompt }] },
            }) + "\n";
            fs.appendFileSync(existingPath, userMsgLine, "utf-8");
        } catch (_) { /* non-fatal */ }

        session = createSession(sessionId, provider, model, {
            existingSessionPath: existingPath,
            sessionLogTimestamp: formatSessionLogTimestamp(),
        });
    } else {
        // Update provider/model if changed
        session.provider = provider;
        session.model = model;
    }

    return { session, sessionId };
}

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
        createSession(sessionId, DEFAULT_SESSION_PROVIDER, DEFAULT_SESSION_MODEL, {
            existingSessionPath: filePath,
            sessionLogTimestamp: formatSessionLogTimestamp(),
        });
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
        const sessionCwd = (typeof payload?.cwd === "string" && payload.cwd.trim()) ? payload.cwd.trim() : getWorkspaceCwd();

        if (!prompt) {
            return res.status(400).json({ ok: false, error: "Prompt cannot be empty" });
        }

        let session;
        let sessionId;
        try {
            ({ session, sessionId } = findOrCreateSession(payload, provider, model, prompt, sessionCwd));
        } catch (err) {
            return res.status(400).json({ ok: false, error: err?.message || "Invalid sessionId" });
        }

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
        const targetPathInput = (typeof rawPath === "string" && rawPath.trim())
            ? path.resolve(rawPath.trim())
            : getWorkspaceCwd();
        const targetPath = (() => {
            try {
                return fs.realpathSync(targetPathInput);
            } catch {
                return targetPathInput;
            }
        })();
        if (!isInsideRoot(WORKSPACE_ALLOWED_ROOT_REAL, targetPath)) {
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
                if (!isValidSessionId(sessionId)) continue;
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
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
        const session = getSession(sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        session.processManager.handleInput(req.body);
        res.json({ ok: true });
    });

    // POST /api/sessions/:sessionId/terminate
    router.post("/:sessionId/terminate", (req, res) => {
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
        const session = getSession(sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        session.processManager.handleTerminate({ resetSession: req.body.resetSession });
        res.json({ ok: true });
    });

    // POST /api/sessions/:sessionId/finished - compatibility endpoint for mobile side-effects
    router.post("/:sessionId/finished", (req, res) => {
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
        // Intentionally no-op: mobile uses this as a completion signal hook.
        res.json({ ok: true, sessionId });
    });

    // GET /api/sessions/:sessionId/messages - Load messages from central .pi/agent/sessions
    router.get("/:sessionId/messages", (req, res) => {
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
        const filePath = resolveSessionFilePath(sessionId);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Session not found" });
        }
        const canonicalSessionId = uuidFromFileStem(path.basename(filePath, ".jsonl"));
        try {
            const messages = parseMessagesFromJsonl(filePath);
            const { provider, modelId, cwd } = parseSessionMetadata(filePath);
            const activeSession = resolveSession(sessionId) || resolveSession(canonicalSessionId);
            const running = activeSession?.processManager?.processRunning?.() ?? false;
            const sseConnected = activeSession ? activeSession.subscribers?.size > 0 : false;
            // When session is running, registry may have migrated to a different id (e.g. Pi session_id).
            // Return that id so the client connects to the correct stream and does not open a duplicate.
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
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
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
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
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
        // Replay history from disk unless client already has it (skipReplay=1 when resuming with preseeded messages)
        if (!skipReplay && !sessionId.startsWith("temp-")) {
            const filePath = session.existingSessionPath && fs.existsSync(session.existingSessionPath)
                ? session.existingSessionPath
                : resolveSessionFilePath(sessionId);
            replayHistoryToResponse(filePath, res);
        }
        if (activeOnly && !processRunning) {
            // Race: mobile connects before Pi emits agent_start. Poll briefly for process to start.
            const maxWaitMs = SSE_PROCESS_START_WAIT_MS;
            const pollMs = SSE_PROCESS_START_POLL_MS;
            const start = Date.now();
            let done = false;
            let pollTimer;
            const isClosed = () =>
                done ||
                res.writableEnded ||
                res.destroyed ||
                req.aborted ||
                req.destroyed ||
                req.socket?.destroyed;
            const cleanup = () => {
                if (done) return;
                done = true;
                if (pollTimer) clearTimeout(pollTimer);
                session.subscribers.delete(res);
            };
            req.on("close", cleanup);
            const check = () => {
                if (isClosed()) {
                    cleanup();
                    return;
                }
                if (session.processManager.processRunning?.()) {
                    if (isClosed()) {
                        cleanup();
                        return;
                    }
                    done = true;
                    session.subscribers.add(res);
                    if (process.env.DEBUG_SSE) {
                        console.log(`[SSE] sessionId=${sessionId} process started after ${Date.now() - start}ms, subscribed`);
                    }
                    return;
                }
                if (Date.now() - start >= maxWaitMs) {
                    done = true;
                    if (pollTimer) clearTimeout(pollTimer);
                    res.write(`event: end\ndata: {"exitCode": 0}\n\n`);
                    res.end();
                    return;
                }
                pollTimer = setTimeout(check, pollMs);
            };
            pollTimer = setTimeout(check, pollMs);
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
