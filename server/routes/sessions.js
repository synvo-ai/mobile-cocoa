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
import { createSession, removeSession, resolveSession, subscribeToSession } from "../sessionRegistry.js";
import { isInsideRoot } from "../utils/index.js";
import { findOrCreateSession } from "./sessionFactory.js";
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
import {
    handleSsePolling,
    handleSseNoSession,
    handleSseReplay,
    isTempSessionId,
    parseBooleanQueryParam,
    setupSseHeaders,
} from "./sessionSseHandler.js";

const DEFAULT_SESSION_PROVIDER = DEFAULT_PROVIDER;
const DEFAULT_SESSION_MODEL = DEFAULT_PROVIDER_MODELS?.[DEFAULT_SESSION_PROVIDER];

const WORKSPACE_ALLOWED_ROOT_REAL = (() => {
    try {
        return fs.realpathSync(WORKSPACE_ALLOWED_ROOT);
    } catch {
        return path.resolve(WORKSPACE_ALLOWED_ROOT);
    }
})();

function normalizeStringOrNull(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveSessionCwdForStatus(record) {
    return normalizeStringOrNull(record?.cwd);
}

function resolveSessionCwdForList(record, workspaceCwd) {
    return (
        normalizeStringOrNull(record?.cwd) ||
        normalizeStringOrNull(deriveCwdFromFilePath(record.filePath)) ||
        workspaceCwd
    );
}

function createStatusSessionRecord(record, now) {
    const running = resolveSessionRunning(record, now);
    return {
        id: record.id,
        cwd: resolveSessionCwdForStatus(record),
        model: record.modelId || null,
        waitingForPermission: record.waitingForPermission === true,
        lastAccess: record.mtimeMs,
        status: running ? "running" : "idling",
        title: record.firstUserInput || "(no input)",
    };
}

function createListSessionRecord(record, now, workspaceCwd) {
    const running = resolveSessionRunning(record, now);
    return {
        id: record.id,
        fileStem: record.fileStem,
        firstUserInput: record.firstUserInput || "(no input)",
        provider: record.provider || null,
        model: record.modelId || null,
        waitingForPermission: record.waitingForPermission === true,
        mtime: record.mtimeMs,
        sseConnected: record.activeSession ? record.activeSession.subscribers?.size > 0 : false,
        running,
        cwd: resolveSessionCwdForList(record, workspaceCwd),
    };
}

function resolveWorkspacePathForDestroy(rawPath) {
    const trimmed = normalizeStringOrNull(rawPath) || getWorkspaceCwd();
    const targetPathInput = path.resolve(trimmed);
    try {
        return fs.realpathSync(targetPathInput);
    } catch {
        return targetPathInput;
    }
}

function requireValidSessionIdParam(req, res) {
    try {
        return assertValidSessionId(req.params.sessionId);
    } catch {
        res.status(400).json({ error: "Invalid sessionId" });
        return null;
    }
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
                discovered.push(createStatusSessionRecord(record, now));
            }
        } catch (error) {
            console.error("[sessions] Failed to list .pi/agent/sessions for status:", error?.message);
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
                discovered.push(createListSessionRecord(record, now, getWorkspaceCwd()));
            }
        } catch (error) {
            console.error("[sessions] Failed to list .pi/agent/sessions:", error?.message);
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
        } catch (error) {
            const errorMessage = error?.message || "Invalid sessionId";
            const statusCode = errorMessage === "Invalid sessionId" ? 400 : 500;
            return res.status(statusCode).json({ ok: false, error: errorMessage });
        }

        try {
            session.processManager.handleSubmitPrompt(payload, req.headers.host);
            res.status(200).json({ sessionId, ok: true });
        } catch (error) {
            // Include sessionId so client can connect to stream even on error (process may have partially started)
            res.status(500).json({ ok: false, error: error.message, sessionId });
        }
    });

    // POST /api/sessions/destroy-workspace - Delete all sessions for a workspace (and their session folders)
    router.post("/destroy-workspace", (req, res) => {
        const rawPath = req.body?.path ?? req.query?.path;
        const targetPath = resolveWorkspacePathForDestroy(rawPath);
        if (!isInsideRoot(WORKSPACE_ALLOWED_ROOT_REAL, targetPath)) {
            return res.status(400).json({ error: "Path must be under allowed root" });
        }
        const sessionsBase = path.join(SESSIONS_ROOT, "sessions");
        let deletedCount = 0;
        try {
            if (!fs.existsSync(sessionsBase)) {
                return res.json({ ok: true, deletedCount: 0 });
            }
            const subdirs = fs.readdirSync(sessionsBase, { withFileTypes: true }).filter((entry) => entry.isDirectory());
            for (const sessionDirEntry of subdirs) {
                const sessionId = sessionDirEntry.name;
                if (!isValidSessionId(sessionId)) continue;
                const filePath = findJsonlInDir(path.join(sessionsBase, sessionId));
                if (!filePath) continue;
                const { cwd } = parseSessionMetadata(filePath);
                const derived = deriveCwdFromFilePath(filePath);
                const resolvedCwd = (typeof cwd === "string" && cwd.trim())
                    ? path.resolve(cwd)
                    : (derived ? path.resolve(derived) : null);
                const resolvedCwdCanonical = resolvedCwd
                    ? (() => {
                        try {
                            return fs.realpathSync(resolvedCwd);
                        } catch {
                            return path.resolve(resolvedCwd);
                        }
                    })()
                    : null;
                if (resolvedCwdCanonical !== targetPath) continue;
                try {
                    const activeSession = resolveSession(sessionId);
                    if (activeSession) removeSession(activeSession.id);
                    const sessionDir = getSessionDir(sessionId);
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true });
                        deletedCount++;
                    }
                } catch (error) {
                    console.error("[sessions] Failed to delete session folder for destroy-workspace:", sessionId, error?.message);
                }
            }
            res.json({ ok: true, deletedCount });
        } catch (error) {
            console.error("[sessions] Failed to destroy workspace sessions:", targetPath, error?.message);
            res.status(500).json({ error: "Failed to destroy workspace sessions" });
        }
    });

    // POST /api/sessions/:sessionId/input
    router.post("/:sessionId/input", (req, res) => {
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
        const session = resolveSession(sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        const accepted = session.processManager.handleInput(req.body);
        if (!accepted) {
            return res.status(409).json({ ok: false, error: "No pending input request" });
        }
        res.json({ ok: true });
    });

    // POST /api/sessions/:sessionId/terminate
    router.post("/:sessionId/terminate", (req, res) => {
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
        const session = resolveSession(sessionId);
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
        const activeSession = resolveSession(sessionId);
        const filePath = activeSession?.existingSessionPath && fs.existsSync(activeSession.existingSessionPath)
            ? activeSession.existingSessionPath
            : resolveSessionFilePath(sessionId);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Session not found" });
        }
        const canonicalSessionId = uuidFromFileStem(path.basename(filePath, ".jsonl"));
        try {
            const messages = parseMessagesFromJsonl(filePath);
            const { provider, modelId, cwd } = parseSessionMetadata(filePath);
            const liveSession = activeSession || resolveSession(canonicalSessionId);
            const running = liveSession?.processManager?.processRunning?.() ?? false;
            const sseConnected = liveSession ? liveSession.subscribers?.size > 0 : false;
            // When session is running, registry may have migrated to a different id (e.g. Pi session_id).
            // Return that id so the client connects to the correct stream and does not open a duplicate.
            const activeSessionId = liveSession?.id ?? canonicalSessionId;
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
        } catch (error) {
            console.error("[sessions] Failed to load messages:", error?.message);
            res.status(500).json({ error: "Failed to load session" });
        }
    });

    // DELETE /api/sessions/:sessionId - Remove session folder and clean up active registry
    router.delete("/:sessionId", (req, res) => {
        const sessionId = requireValidSessionIdParam(req, res);
        if (!sessionId) return;
        const activeSession = resolveSession(sessionId);
        const candidateSessionIds = [activeSession?.id, sessionId].filter(Boolean);
        let filePath = activeSession?.existingSessionPath && fs.existsSync(activeSession.existingSessionPath)
            ? activeSession.existingSessionPath
            : null;
        if (!filePath) {
            for (const candidateSessionId of candidateSessionIds) {
                const resolvedPath = resolveSessionFilePath(candidateSessionId);
                if (resolvedPath) {
                    filePath = resolvedPath;
                    break;
                }
            }
        }
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Session not found" });
        }
        const resolvedSessionDir = path.dirname(filePath);
        try {
            if (activeSession) {
                removeSession(activeSession.id);
            } else {
                for (const candidateSessionId of candidateSessionIds) {
                    const resolved = resolveSession(candidateSessionId);
                    if (resolved) {
                        removeSession(resolved.id);
                        break;
                    }
                }
            }
            fs.rmSync(resolvedSessionDir, { recursive: true });
            res.json({ ok: true });
        } catch (error) {
            console.error("[sessions] Failed to delete session folder:", resolvedSessionDir, error?.message);
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
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders?.();

        if (!session) {
            // Session not in registry (e.g. server restarted). Try to replay history from disk
            // before closing the connection so the client can restore its message history.
            const skipReplay = parseBooleanQueryParam(req.query.skipReplay);
            if (!skipReplay && !isTempSessionId(sessionId)) {
                const filePath = resolveSessionFilePath(sessionId);
                replayHistoryToResponse(filePath, res);
            }
            res.write(`event: end\ndata: {"exitCode": 0}\n\n`);
            res.end();
            return;
        }

        const activeOnly = parseBooleanQueryParam(req.query.activeOnly);
        const skipReplay = parseBooleanQueryParam(req.query.skipReplay);
        const processRunning = session.processManager.processRunning?.() || false;
        // Replay history from disk unless client already has it (skipReplay=1 when resuming with preseeded messages)
        if (!skipReplay && !isTempSessionId(sessionId)) {
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
