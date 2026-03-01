/**
 * Session SSE stream handling utilities.
 * Handles SSE connection setup, polling, and subscription logic.
 * Extracted from sessions.js for better maintainability.
 */
import fs from "fs";
import { SSE_PROCESS_START_POLL_MS, SSE_PROCESS_START_WAIT_MS } from "../config/constants.js";
import { subscribeToSession } from "../sessionRegistry.js";
import { replayHistoryToResponse, resolveSessionFilePath } from "./sessionHelpers.js";

const TRUE_VALUES = new Set(["1", "true"]);

/**
 * Parse boolean query parameter value.
 * @param {string | undefined} rawValue - Query parameter value
 * @returns {boolean}
 */
export function parseBooleanQueryParam(rawValue) {
    return TRUE_VALUES.has(String(rawValue ?? ""));
}

/**
 * Check if a session ID is a temporary session.
 * @param {string} sessionId - Session ID to check
 * @returns {boolean}
 */
export function isTempSessionId(sessionId) {
    return typeof sessionId === "string" && sessionId.startsWith("temp-");
}

/**
 * Handle SSE polling for process start.
 * When activeOnly is set and process isn't running yet, poll briefly for it to start.
 *
 * @param {object} params - Handler parameters
 * @param {object} params.session - Session object
 * @param {string} params.sessionId - Session ID
 * @param {object} params.req - Express request
 * @param {object} params.res - Express response
 * @returns {void}
 */
export function handleSsePolling({ session, sessionId, req, res }) {
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
        if (Date.now() - start >= SSE_PROCESS_START_WAIT_MS) {
            done = true;
            if (pollTimer) clearTimeout(pollTimer);
            res.write(`event: end\ndata: {"exitCode": 0}\n\n`);
            res.end();
            return;
        }
        pollTimer = setTimeout(check, SSE_PROCESS_START_POLL_MS);
    };

    pollTimer = setTimeout(check, SSE_PROCESS_START_POLL_MS);
}

/**
 * Setup SSE headers on response.
 * @param {object} res - Express response
 */
export function setupSseHeaders(res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
}

/**
 * Handle SSE replay from disk when session is not in registry.
 *
 * @param {object} params - Handler parameters
 * @param {string} params.sessionId - Session ID
 * @param {boolean} params.skipReplay - Whether to skip replay
 * @param {object} params.res - Express response
 */
export function handleSseNoSession({ sessionId, skipReplay, res }) {
    if (!skipReplay && !isTempSessionId(sessionId)) {
        const filePath = resolveSessionFilePath(sessionId);
        replayHistoryToResponse(filePath, res);
    }
    res.write(`event: end\ndata: {"exitCode": 0}\n\n`);
    res.end();
}

/**
 * Handle SSE replay for active session.
 *
 * @param {object} params - Handler parameters
 * @param {object} params.session - Session object
 * @param {string} params.sessionId - Session ID
 * @param {boolean} params.skipReplay - Whether to skip replay
 * @param {object} params.res - Express response
 */
export function handleSseReplay({ session, sessionId, skipReplay, res }) {
    if (!skipReplay && !isTempSessionId(sessionId)) {
        const filePath = session.existingSessionPath && fs.existsSync(session.existingSessionPath)
            ? session.existingSessionPath
            : resolveSessionFilePath(sessionId);
        replayHistoryToResponse(filePath, res);
    }
}
