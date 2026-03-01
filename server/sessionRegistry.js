import { createSessionProcessManager } from "./process/index.js";

/**
 * Global registry mapping sessionId -> session state
 *
 * Session shape:
 * {
 *   id: string,
 *   processManager: { processRunning, handleSubmitPrompt, handleInput, handleTerminate, cleanup },
 *   subscribers: Set<Response>,
 *   provider: string,
 *   model: string,
 *   sessionLogTimestamp: string,
 * }
 */
const registry = new Map();

/**
 * @param {string} sessionId
 * @param {string} provider
 * @param {string} model
 * @param {{ existingSessionPath?: string; sessionLogTimestamp?: string }} [options]
 */
export function createSession(sessionId, provider, model, options = {}) {
  if (registry.has(sessionId)) {
    return registry.get(sessionId);
  }

  const session = {
    id: sessionId,
    subscribers: new Set(),
    provider,
    model,
    sessionLogTimestamp: options.sessionLogTimestamp ?? null,
    /** File path for replay; survives migrateSessionId (file stays at original path). */
    existingSessionPath: options.existingSessionPath ?? null,
  };

  const onPiSessionId = (piId) => migrateSessionId(sessionId, piId);
  session.processManager = createSessionProcessManager(sessionId, session, {
    onPiSessionId,
    existingSessionPath: options.existingSessionPath,
    sessionLogTimestamp: options.sessionLogTimestamp,
  });

  registry.set(sessionId, session);
  return session;
}

export function getSession(sessionId) {
  return registry.get(sessionId);
}

/**
 * Resolve session by ID, file stem, or UUID. Tries direct lookup first,
 * then scans registry for keys ending with the UUID (e.g. timestamp_uuid).
 */
export function resolveSession(sessionId) {
  const s = registry.get(sessionId);
  if (s) return s;
  for (const [key, session] of registry) {
    if (key === sessionId || key.endsWith(`_${sessionId}`) || session.id === sessionId) return session;
  }
  return null;
}

/**
 * Migrate a session to a new ID (when Pi agent emits its native session_id).
 */
export function migrateSessionId(fromId, toId) {
  const session = registry.get(fromId);
  if (!session || fromId === toId) return;
  session.id = toId;
  registry.delete(fromId);
  registry.set(toId, session);
}

export function removeSession(sessionId) {
  const session = registry.get(sessionId);
  if (session) {
    session.processManager?.cleanup();
    session.subscribers.forEach((res) => {
      try {
        res.end();
      } catch (_) {}
    });
    session.subscribers.clear();
    registry.delete(sessionId);
  }
}

export function subscribeToSession(sessionId, res) {
  const session = resolveSession(sessionId);
  if (session) {
    session.subscribers.add(res);
  }
}
