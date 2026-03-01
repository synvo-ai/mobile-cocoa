import { createSessionProcessManager } from "./process/index.js";

const SESSION_ID_MIGRATION_PREFIX = "_";

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

/** Create a stable session record with consistent defaults for optional fields. */
function createSessionRecord(sessionId, provider, model, options = {}) {
  const sessionLogTimestamp = options.sessionLogTimestamp ?? null;
  const existingSessionPath = options.existingSessionPath ?? null;

  return {
    id: sessionId,
    subscribers: new Set(),
    provider,
    model,
    sessionLogTimestamp,
    /** File path for replay; survives migrateSessionId (file stays at original path). */
    existingSessionPath,
  };
}

function matchesSessionId(sessionId, key, session) {
  if (key === sessionId) return true;
  if (key.endsWith(`${SESSION_ID_MIGRATION_PREFIX}${sessionId}`)) return true;
  return session.id === sessionId;
}

function closeSessionSubscribers(session) {
  for (const res of session.subscribers) {
    try {
      res.end();
    } catch (_) {}
  }
  session.subscribers.clear();
}

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

  const session = createSessionRecord(sessionId, provider, model, options);
  const onPiSessionId = (piId) => migrateSessionId(sessionId, piId);

  const {
    existingSessionPath,
    sessionLogTimestamp,
  } = session;
  session.processManager = createSessionProcessManager(sessionId, session, {
    onPiSessionId,
    existingSessionPath,
    sessionLogTimestamp,
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
    if (matchesSessionId(sessionId, key, session)) return session;
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
    closeSessionSubscribers(session);
    registry.delete(sessionId);
  }
}

export function subscribeToSession(sessionId, res) {
  const session = resolveSession(sessionId);
  if (session) {
    session.subscribers.add(res);
  }
}
