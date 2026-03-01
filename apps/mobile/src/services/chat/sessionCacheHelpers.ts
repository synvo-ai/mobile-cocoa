import type { Message } from "@/core/types";
import type { SessionLiveState } from "./hooksTypes";
import type { SessionCacheEntry, SessionToolUse } from "./sessionCacheTypes";
import { createSessionCacheEntry } from "./sessionCacheTypes";

// ── LRU Cache Eviction ───────────────────────────────────────────────────
// Prevents unbounded memory growth on mobile devices when users access
// many sessions over time. Keeps the most recently accessed sessions.
export const MAX_CACHED_SESSIONS = 15;
const sessionAccessOrder: string[] = [];

// Re-export types for convenience
export type { SessionCacheEntry, SessionToolUse } from "./sessionCacheTypes";
export { createSessionCacheEntry } from "./sessionCacheTypes";

/** Mark a session as recently used (moves it to the end of the LRU list). */
export const touchSession = (sessionId: string): void => {
  const existingIndex = sessionAccessOrder.indexOf(sessionId);
  if (existingIndex >= 0) sessionAccessOrder.splice(existingIndex, 1);
  sessionAccessOrder.push(sessionId);
};

/** Evict oldest sessions from all cache maps until we're at or below the limit. */
export const evictOldestSessions = (
  sessionStates: Map<string, SessionLiveState>,
  sessionMessages: Map<string, Message[]>,
  sessionDrafts: Map<string, string>,
  activeSessionId?: string | null,
): void => {
  let safetyCounter = 0;
  while (sessionAccessOrder.length > MAX_CACHED_SESSIONS && safetyCounter < sessionAccessOrder.length + 5) {
    safetyCounter++;
    const oldest = sessionAccessOrder[0];
    if (!oldest) break;
    // Never evict the currently active session
    if (oldest === activeSessionId) {
      sessionAccessOrder.splice(0, 1);
      sessionAccessOrder.push(oldest);
      continue;
    }
    sessionAccessOrder.splice(0, 1);
    sessionStates.delete(oldest);
    sessionMessages.delete(oldest);
    sessionDrafts.delete(oldest);
  }
};

/** Reset the access order (for testing). */
export const _resetAccessOrder = (): void => {
  sessionAccessOrder.length = 0;
};

// ── Session State Helpers ────────────────────────────────────────────────

export const getOrCreateSessionState = (sessionStates: Map<string, SessionLiveState>, sessionId: string): SessionLiveState => {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = { sessionState: "idle" };
    sessionStates.set(sessionId, state);
  }
  return state;
};

export const getOrCreateSessionMessages = (sessionMessages: Map<string, Message[]>, sessionId: string): Message[] => {
  let messages = sessionMessages.get(sessionId);
  if (!messages) {
    messages = [];
    sessionMessages.set(sessionId, messages);
  }
  return messages;
};

export const getSessionDraft = (sessionDrafts: Map<string, string>, sessionId: string): string =>
  sessionDrafts.get(sessionId) ?? "";

export const setSessionDraft = (sessionDrafts: Map<string, string>, sessionId: string, draft: string): void => {
  if (draft.length > 0) {
    sessionDrafts.set(sessionId, draft);
    return;
  }
  sessionDrafts.delete(sessionId);
};

export const setSessionMessages = (sessionMessages: Map<string, Message[]>, sessionId: string, messages: Message[]): void => {
  sessionMessages.set(sessionId, messages);
};

export const moveSessionCacheData = (
  currentSessionId: string,
  nextSessionId: string,
  sessionStates: Map<string, SessionLiveState>,
  sessionMessages: Map<string, Message[]>,
  sessionDrafts: Map<string, string>,
): void => {
  const state = sessionStates.get(currentSessionId);
  const messages = sessionMessages.get(currentSessionId);
  const draft = sessionDrafts.get(currentSessionId);

  if (state) {
    sessionStates.delete(currentSessionId);
    sessionStates.set(nextSessionId, state);
  }
  if (messages) {
    sessionMessages.delete(currentSessionId);
    sessionMessages.set(nextSessionId, messages);
  }
  if (draft !== undefined) {
    sessionDrafts.delete(currentSessionId);
    sessionDrafts.set(nextSessionId, draft);
  }
  // Update LRU order for the rekey
  const existingIndex = sessionAccessOrder.indexOf(currentSessionId);
  if (existingIndex >= 0) {
    sessionAccessOrder[existingIndex] = nextSessionId;
  } else {
    sessionAccessOrder.push(nextSessionId);
  }
};

// ── Unified Cache Helpers ─────────────────────────────────────────────────
// These helpers work with the unified SessionCacheEntry structure.

/**
 * Get or create a unified session cache entry.
 */
export const getOrCreateUnifiedSession = (
  cache: Map<string, SessionCacheEntry>,
  sessionId: string
): SessionCacheEntry => {
  let entry = cache.get(sessionId);
  if (!entry) {
    entry = createSessionCacheEntry();
    cache.set(sessionId, entry);
  }
  return entry;
};

/**
 * Evict oldest sessions from unified cache.
 */
export const evictOldestUnifiedSessions = (
  cache: Map<string, SessionCacheEntry>,
  activeSessionId?: string | null,
): void => {
  let safetyCounter = 0;
  while (sessionAccessOrder.length > MAX_CACHED_SESSIONS && safetyCounter < sessionAccessOrder.length + 5) {
    safetyCounter++;
    const oldest = sessionAccessOrder[0];
    if (!oldest) break;
    if (oldest === activeSessionId) {
      sessionAccessOrder.splice(0, 1);
      sessionAccessOrder.push(oldest);
      continue;
    }
    sessionAccessOrder.splice(0, 1);
    cache.delete(oldest);
  }
};

/**
 * Move unified session cache data during rekey.
 */
export const moveUnifiedSessionCacheData = (
  currentSessionId: string,
  nextSessionId: string,
  cache: Map<string, SessionCacheEntry>,
): void => {
  const entry = cache.get(currentSessionId);
  if (entry) {
    cache.delete(currentSessionId);
    cache.set(nextSessionId, entry);
  }
  const existingIndex = sessionAccessOrder.indexOf(currentSessionId);
  if (existingIndex >= 0) {
    sessionAccessOrder[existingIndex] = nextSessionId;
  } else {
    sessionAccessOrder.push(nextSessionId);
  }
};
