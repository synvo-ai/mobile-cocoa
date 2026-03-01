/**
 * Submit prompt handling utilities.
 * Extracted from useChatActions to improve maintainability.
 */
import type { Message } from "@/core/types";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { SessionLiveState, SessionRuntimeState } from "./hooksTypes";

export interface SubmitHandlerDeps {
  sessionId: string | null;
  displayedSessionIdRef: MutableRefObject<string | null>;
  liveMessagesRef: MutableRefObject<Message[]>;
  pendingMessagesForNewSessionRef: MutableRefObject<Message[]>;
  outputBufferRef: MutableRefObject<string>;
  skipReplayForSessionRef: MutableRefObject<string | null>;
  getOrCreateSessionState: (sessionId: string) => SessionLiveState;
  getOrCreateSessionMessages: (sessionId: string) => Message[];
  setSessionMessages: (sessionId: string, messages: Message[]) => void;
  setSessionDraft: (sessionId: string, draft: string) => void;
  setSessionStateForSession: (sessionId: string | null, next: SessionRuntimeState) => void;
  setConnectionIntent: (sessionId: string | null, shouldConnect: boolean) => void;
  deduplicateMessageIds: (messages: Message[]) => Message[];
  touchSession: (sessionId: string) => void;
  evictOldestSessions: (activeSessionId?: string | null) => void;
  setLiveSessionMessages: Dispatch<SetStateAction<Message[]>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  syncRunningStatusToGlobalStore: (targetSessionId: string, promptText: string) => void;
}

export interface SubmitSuccessData {
  ok: true;
  sessionId: string;
}

export interface SubmitErrorData {
  ok?: false;
  sessionId?: string;
  error?: string;
}

/**
 * Apply a successful submit response from the server.
 */
export function applySubmitSuccess(
  data: SubmitSuccessData,
  safePrompt: string,
  deps: SubmitHandlerDeps
): void {
  const {
    sessionId,
    displayedSessionIdRef,
    liveMessagesRef,
    pendingMessagesForNewSessionRef,
    outputBufferRef,
    skipReplayForSessionRef,
    getOrCreateSessionState,
    getOrCreateSessionMessages,
    setSessionMessages,
    setSessionDraft,
    setSessionStateForSession,
    setConnectionIntent,
    deduplicateMessageIds,
    touchSession,
    evictOldestSessions,
    setLiveSessionMessages,
    setSessionId,
    syncRunningStatusToGlobalStore,
  } = deps;

  const newSessionId = data.sessionId;
  syncRunningStatusToGlobalStore(newSessionId, safePrompt);
  const newState = getOrCreateSessionState(newSessionId);
  const currentMessages = getOrCreateSessionMessages(newSessionId);
  newState.sessionState = "running";
  const merged = deduplicateMessageIds([...currentMessages, ...pendingMessagesForNewSessionRef.current]);
  setSessionMessages(newSessionId, merged.length > 0 ? merged : []);
  pendingMessagesForNewSessionRef.current = [];
  setSessionDraft(newSessionId, "");
  const messagesToDisplay = getOrCreateSessionMessages(newSessionId);
  if (displayedSessionIdRef.current === newSessionId) {
    setLiveSessionMessages([...messagesToDisplay]);
    liveMessagesRef.current = messagesToDisplay;
  }
  outputBufferRef.current = "";
  setSessionStateForSession(newSessionId, "running");
  // Skip JSONL replay so previous turns' message_update events aren't re-processed.
  skipReplayForSessionRef.current = newSessionId;
  setConnectionIntent(newSessionId, true);
  touchSession(newSessionId);
  evictOldestSessions(newSessionId);
  if (!sessionId || sessionId !== newSessionId) {
    setSessionId(newSessionId);
  }
}

/**
 * Apply an error response (server returned ok: false or missing sessionId).
 */
export function applySubmitError(
  data: SubmitErrorData,
  deps: Pick<
    SubmitHandlerDeps,
    | "sessionId"
    | "getOrCreateSessionState"
    | "getOrCreateSessionMessages"
    | "setSessionMessages"
    | "setConnectionIntent"
    | "deduplicateMessageIds"
    | "setLiveSessionMessages"
    | "liveMessagesRef"
    | "setSessionId"
    | "setSessionStateForSession"
    | "pendingMessagesForNewSessionRef"
  >,
  resetRunningState: () => void
): void {
  const {
    sessionId,
    getOrCreateSessionState,
    getOrCreateSessionMessages,
    setSessionMessages,
    setConnectionIntent,
    deduplicateMessageIds,
    setLiveSessionMessages,
    liveMessagesRef,
    setSessionId,
    setSessionStateForSession,
    pendingMessagesForNewSessionRef,
  } = deps;

  const errorSessionId = typeof data.sessionId === "string" && !data.sessionId.startsWith("temp-")
    ? data.sessionId
    : null;
  if (errorSessionId) {
    const errorState = getOrCreateSessionState(errorSessionId);
    const errorStateMessages = getOrCreateSessionMessages(errorSessionId);
    errorState.sessionState = "idle";
    const merged = deduplicateMessageIds([...errorStateMessages, ...pendingMessagesForNewSessionRef.current]);
    setSessionMessages(errorSessionId, merged);
    pendingMessagesForNewSessionRef.current = [];
    setLiveSessionMessages([...merged]);
    liveMessagesRef.current = merged;
    setSessionId(errorSessionId);
    setSessionStateForSession(errorSessionId, "idle");
  }
  resetRunningState();
  setConnectionIntent(sessionId, false);
  if (__DEV__ && !data.ok) {
    console.warn("[sse] submit prompt failed:", data?.error ?? "no sessionId in response");
  }
}
