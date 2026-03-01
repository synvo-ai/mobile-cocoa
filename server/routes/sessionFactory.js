/**
 * Session factory utilities.
 * Handles session creation, validation, and file management.
 * Extracted from sessions.js for better maintainability.
 */
import crypto from "crypto";
import fs from "fs";
import { formatSessionLogTimestamp } from "../process/index.js";
import { createSession, getSession, removeSession } from "../sessionRegistry.js";
import {
    assertValidSessionId,
    createNewSessionFile,
    resolveSessionFilePath,
} from "./sessionHelpers.js";

/**
 * Append a user prompt to a session file.
 * @param {string} filePath - Path to the session JSONL file
 * @param {string} prompt - User prompt text
 * @returns {boolean} True if successful
 */
export function appendUserPromptToSessionFile(filePath, prompt) {
    if (!filePath || !prompt) return false;
    try {
        const messageId = crypto.randomUUID();
        const userMsgLine = JSON.stringify({
            type: "message",
            id: messageId,
            timestamp: new Date().toISOString(),
            message: {
                id: messageId,
                role: "user",
                content: [{ type: "text", text: prompt }],
                metadata: {
                    source: "client_prewrite",
                    sourceId: messageId,
                },
            },
        }) + "\n";
        fs.appendFileSync(filePath, userMsgLine, "utf-8");
        return true;
    } catch (error) {
        console.error("[sessions] Failed to persist pre-written prompt:", error?.message);
    }
    return false;
}

/**
 * Find an existing session or create (and optionally replace) one.
 * Writes the user prompt to the JSONL immediately so GET /messages can find it
 * during streaming — Pi may not log the user message until many events later.
 *
 * @param {object} payload - Request payload with sessionId and replaceRunning flag
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {string} prompt - User prompt text
 * @param {string} sessionCwd - Session working directory
 * @returns {{ session: object, sessionId: string }}
 */
export function findOrCreateSession(payload, provider, model, prompt, sessionCwd) {
    let sessionId = null;
    if (typeof payload?.sessionId === "string" && payload.sessionId.trim()) {
        const candidate = payload.sessionId.trim();
        if (!candidate.startsWith("temp-")) {
            sessionId = assertValidSessionId(candidate);
        }
    }

    let session = sessionId ? getSession(sessionId) : null;
    let existingPath = null;

    if (!session || payload.replaceRunning) {
        if (session) removeSession(sessionId);
        if (!sessionId) sessionId = crypto.randomUUID();

        existingPath = resolveSessionFilePath(sessionId);
        if (!existingPath) {
            existingPath = createNewSessionFile(sessionId, sessionCwd);
        }
        if (!existingPath) {
            throw new Error("Failed to create session file path");
        }

        session = createSession(sessionId, provider, model, {
            existingSessionPath: existingPath,
            sessionLogTimestamp: formatSessionLogTimestamp(),
        });
    } else {
        // Update provider/model if changed
        session.provider = provider;
        session.model = model;
        existingPath = session.existingSessionPath && fs.existsSync(session.existingSessionPath)
            ? session.existingSessionPath
            : resolveSessionFilePath(sessionId);
        if (!existingPath) {
            existingPath = createNewSessionFile(sessionId, sessionCwd);
            if (!existingPath) {
                throw new Error("Failed to create session file path");
            }
            session.existingSessionPath = existingPath;
        }
    }

    // Pre-write the user prompt to JSONL for all submit paths so /messages
    // can surface the latest user turn immediately during/after streaming.
    const didAppendPrompt = appendUserPromptToSessionFile(existingPath, prompt);
    if (!didAppendPrompt) {
        throw new Error("Failed to persist user prompt before streaming");
    }

    return { session, sessionId };
}
