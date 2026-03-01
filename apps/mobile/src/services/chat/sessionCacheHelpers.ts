import type { Message } from "@/core/types";
import type { SessionLiveState } from "./hooksTypes";

// ── LRU Cache Eviction ───────────────────────────────────────────────────
// Prevents unbounded memory growth on mobile devices when users access
// many sessions over time. Keeps the most recently accessed sessions.
export const MAX_CACHED_SESSIONS = 15;
const sessionAccessOrder: string[] = [];

/** Mark a session as recently used (moves it to the end of the LRU list). */
export const touchSession = (sid: string): void => {
  const idx = sessionAccessOrder.indexOf(sid);
  if (idx >= 0) sessionAccessOrder.splice(idx, 1);
  sessionAccessOrder.push(sid);
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

export const getOrCreateSessionState = (sessionStates: Map<string, SessionLiveState>, sid: string): SessionLiveState => {
  let state = sessionStates.get(sid);
  if (!state) {
    state = { sessionState: "idle" };
    sessionStates.set(sid, state);
  }
  return state;
};

export const getOrCreateSessionMessages = (sessionMessages: Map<string, Message[]>, sid: string): Message[] => {
  let messages = sessionMessages.get(sid);
  if (!messages) {
    messages = [];
    sessionMessages.set(sid, messages);
  }
  return messages;
};

export const getSessionDraft = (sessionDrafts: Map<string, string>, sid: string): string => sessionDrafts.get(sid) ?? "";

export const setSessionDraft = (sessionDrafts: Map<string, string>, sid: string, draft: string): void => {
  if (draft.length > 0) {
    sessionDrafts.set(sid, draft);
    return;
  }
  sessionDrafts.delete(sid);
};

export const setSessionMessages = (sessionMessages: Map<string, Message[]>, sid: string, messages: Message[]): void => {
  sessionMessages.set(sid, messages);
};

export const moveSessionCacheData = (
  currentSid: string,
  nextSid: string,
  sessionStates: Map<string, SessionLiveState>,
  sessionMessages: Map<string, Message[]>,
  sessionDrafts: Map<string, string>,
): void => {
  const state = sessionStates.get(currentSid);
  const messages = sessionMessages.get(currentSid);
  const draft = sessionDrafts.get(currentSid);

  if (state) {
    sessionStates.delete(currentSid);
    sessionStates.set(nextSid, state);
  }
  if (messages) {
    sessionMessages.delete(currentSid);
    sessionMessages.set(nextSid, messages);
  }
  if (draft !== undefined) {
    sessionDrafts.delete(currentSid);
    sessionDrafts.set(nextSid, draft);
  }
  // Update LRU order for the rekey
  const idx = sessionAccessOrder.indexOf(currentSid);
  if (idx >= 0) {
    sessionAccessOrder[idx] = nextSid;
  } else {
    sessionAccessOrder.push(nextSid);
  }
};
