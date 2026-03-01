/**
 * useChat hook - Main state management for SSE connection and AI sessions.
 *
 * This hook manages:
 * - SSE EventSource connection lifecycle
 * - Chat message state
 * - Session state (idle, running)
 * - Permission handling
 */
import type { CodeReference, LastRunOptions, Message, PendingAskUserQuestion, PermissionDenial } from "@/core/types";
import { getDefaultServerConfig } from "@/services/server/config";
import { useSessionManagementStore } from "@/state/sessionManagementStore";
import { useCallback, useRef, useState } from "react";
import { resolveDefaultModel } from "./chatHookHelpers";
import type { EventSourceLike, SessionLiveState, SessionRuntimeState, UseChatOptions } from "./hooks-types";
import {
    deduplicateDenials,
    deduplicateMessageIds as deduplicateMessageIdsUtil,
    getMaxMessageId
} from "./hooks-utils";
import {
    getOrCreateSessionMessages as getOrCreateSessionMessagesFromCache, getOrCreateSessionState as getOrCreateSessionStateFromCache, getSessionDraft as getSessionDraftFromCache,
    setSessionDraft as setSessionDraftFromCache,
    setSessionMessages as setSessionMessagesFromCache,
    touchSession,
    evictOldestSessions,
} from "./sessionCacheHelpers";
import { useChatActions } from "./useChatActions";
import { useChatExternalCallbacks } from "./useChatExternalCallbacks";
import { useChatStreamingLifecycle } from "./useChatStreamingLifecycle";

// Re-export hook types for consumers.
export type { Message, CodeReference, PermissionDenial, PendingAskUserQuestion, LastRunOptions };
export type { UseChatOptions, SessionRuntimeState };

export function useChat(options: UseChatOptions = {}) {
  const serverConfig = options.serverConfig ?? getDefaultServerConfig();
  const serverUrl = serverConfig.getBaseUrl();
  const provider = options.provider ?? "codex";

  const defaultModel = resolveDefaultModel(provider);
  const model = options.model ?? defaultModel;
  const [connected, setConnected] = useState(false);
  const [liveSessionMessages, setLiveSessionMessages] = useState<Message[]>([]);

  const [waitingForUserInput, setWaitingForUserInput] = useState(false);
  const [sessionState, setSessionState] = useState<SessionRuntimeState>("idle");

  const [sessionId, setSessionId] = useState<string | null>(null);

  const [permissionDenials, setPermissionDenials] = useState<PermissionDenial[] | null>(null);
  const lastRunOptionsRef = useRef<LastRunOptions>({
    permissionMode: null,
    allowedTools: [],
    useContinue: false,
  });

  const [pendingAskQuestion, setPendingAskQuestion] = useState<PendingAskUserQuestion | null>(null);
  const [lastSessionTerminated, setLastSessionTerminated] = useState(false);

  const activeSseRef = useRef<{ id: string; source: EventSourceLike } | null>(null);
  const activeSseHandlersRef = useRef<{
    open: (event: unknown) => void;
    error: (event: unknown) => void;
    message: (event: any) => void;
    end: (event: any) => void;
    done: (event: any) => void;
  } | null>(null);
  const suppressActiveSessionSwitchRef = useRef(false);
  const selectedSessionRuntimeRef = useRef<{ id: string | null; running: boolean } | null>(null);
  const connectionIntentBySessionRef = useRef<Map<string, boolean>>(new Map());
  const sawAgentEndRef = useRef(false);
  const outputBufferRef = useRef("");

  const sessionStatesRef = useRef<Map<string, SessionLiveState>>(new Map());
  const sessionMessagesRef = useRef<Map<string, Message[]>>(new Map());
  const sessionDraftRef = useRef<Map<string, string>>(new Map());
  const displayedSessionIdRef = useRef<string | null>(null);

  const getOrCreateSessionState = useCallback((sid: string): SessionLiveState => {
    return getOrCreateSessionStateFromCache(sessionStatesRef.current, sid);
  }, []);

  const getOrCreateSessionMessages = useCallback(
    (sid: string): Message[] => getOrCreateSessionMessagesFromCache(sessionMessagesRef.current, sid),
    []
  );

  const getSessionDraft = useCallback((sid: string): string => getSessionDraftFromCache(sessionDraftRef.current, sid), []);

  const setSessionDraft = useCallback(
    (sid: string, draft: string) => setSessionDraftFromCache(sessionDraftRef.current, sid, draft),
    []
  );

  const setSessionMessages = useCallback(
    (sid: string, messages: Message[]) => setSessionMessagesFromCache(sessionMessagesRef.current, sid, messages),
    []
  );

  const setSessionStateForSession = useCallback(
    (sid: string | null, next: SessionRuntimeState) => {
      if (!sid) {
        setSessionState(next);
        return;
      }
      const state = getOrCreateSessionState(sid);
      state.sessionState = next;
      if (displayedSessionIdRef.current === sid) {
        setSessionState(next);
      }
    },
    [getOrCreateSessionState]
  );

  const nextIdRef = useRef(0);
  const toolUseByIdRef = useRef<Map<string, { tool_name: string; tool_input?: Record<string, unknown> }>>(new Map());
  // Periodic cleanup: entries older than ~5 min are orphaned (tool_result never arrived).
  // Clear the entire map on session transitions (closeActiveSse) to keep it bounded.
  const liveMessagesRef = useRef<Message[]>([]);
  liveMessagesRef.current = liveSessionMessages;
  const currentSessionIdRef = useRef<string | null>(null);
  currentSessionIdRef.current = sessionId;
  displayedSessionIdRef.current = sessionId;

  const streamFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipReplayForSessionRef = useRef<string | null>(null);
  const sessionStatuses = useSessionManagementStore((state) => state.sessionStatuses);
  const storeSessionId = useSessionManagementStore((state) => state.sessionId);
  const setStoreSessionId = useSessionManagementStore((state) => state.setSessionId);

  const getConnectionIntent = useCallback((sid: string | null): boolean | undefined => {
    if (!sid) return undefined;
    return connectionIntentBySessionRef.current.get(sid);
  }, []);

  const setConnectionIntent = useCallback((sid: string | null, shouldConnect: boolean) => {
    if (!sid) return;
    if (shouldConnect) {
      connectionIntentBySessionRef.current.set(sid, true);
      return;
    }
    connectionIntentBySessionRef.current.delete(sid);
  }, []);

  const clearConnectionIntent = useCallback((sid: string | null) => {
    if (!sid) return;
    connectionIntentBySessionRef.current.delete(sid);
  }, []);

  const syncSessionToReact = useCallback(
    (sid: string | null) => {
      if (!sid) return;
      const s = sessionStatesRef.current.get(sid);
      const messages = getOrCreateSessionMessages(sid);
      if (s) {
        setLiveSessionMessages(messages);
        setSessionState(s.sessionState);
        outputBufferRef.current = "";
        liveMessagesRef.current = messages;
      } else {
        const isDisplayedSession = displayedSessionIdRef.current === sid;
        const hasDisplayedMessages = liveMessagesRef.current.length > 0;
        if (!(isDisplayedSession && hasDisplayedMessages)) {
          setLiveSessionMessages([]);
          liveMessagesRef.current = [];
        }
        outputBufferRef.current = "";
        setSessionState("idle");
        setWaitingForUserInput(false);
      }
    },
    [getOrCreateSessionMessages]
  );

  const closeActiveSse = useCallback(
    (reason?: string) => {
      const active = activeSseRef.current;
      if (!active) {
        return;
      }
      const { id, source } = active;
      const handlers = activeSseHandlersRef.current;
      if (__DEV__) {
        console.log("[sse] disconnected", { reason: reason ?? "close", sessionId: id });
      }
      // Null the refs FIRST to prevent any in-flight queued SSE events from
      // referencing the old session after close. This fixes the race where
      // late-arriving chunks for the previous session corrupt display state.
      activeSseRef.current = null;
      activeSseHandlersRef.current = null;
      if (handlers) {
        source.removeEventListener("open", handlers.open);
        source.removeEventListener("error", handlers.error);
        source.removeEventListener("message", handlers.message);
        source.removeEventListener("end", handlers.end);
        source.removeEventListener("done", handlers.done);
      }
      source.close();
      if (displayedSessionIdRef.current === id) {
        if (sawAgentEndRef.current) {
          // Normal end — agent_end was received.
          setSessionStateForSession(id, "idle");
          setWaitingForUserInput(false);
        } else if (reason !== "session-switch" && reason !== "session-load" && reason !== "new-session") {
          // Server ended (crash/restart) while session was running — agent_end was never sent.
          // Transition to idle so the UI doesn't stay stuck in "running" state.
          if (__DEV__) console.log("[sse] server ended without agent_end, forcing idle", { sessionId: id, reason });
          setSessionStateForSession(id, "idle");
          setWaitingForUserInput(false);
          setLastSessionTerminated(true);
        }
      }
      suppressActiveSessionSwitchRef.current = false;
      if (streamFlushTimeoutRef.current) {
        clearTimeout(streamFlushTimeoutRef.current);
        streamFlushTimeoutRef.current = null;
      }
      clearConnectionIntent(id);
      // Clear orphaned tool_use records to prevent slow memory leak when
      // tool_result never arrives (e.g. SSE drops, session crash).
      toolUseByIdRef.current.clear();
      setConnected(false);
    },
    [clearConnectionIntent, setSessionStateForSession]
  );

  const deduplicateMessageIds = useCallback(
    (msgs: Message[]): Message[] => deduplicateMessageIdsUtil(msgs, nextIdRef),
    []
  );

  const pendingMessagesForNewSessionRef = useRef<Message[]>([]);

  const addMessage = useCallback(
    (role: Message["role"], content: string, codeReferences?: CodeReference[]) => {
      const sid = currentSessionIdRef.current;
      const id = `msg-${++nextIdRef.current}`;
      const newMsg: Message = { id, role, content, codeReferences };
      if (!sid) {
        setLiveSessionMessages((prev) => [...prev, newMsg]);
        pendingMessagesForNewSessionRef.current = [...pendingMessagesForNewSessionRef.current, newMsg];
        return id;
      }
      const messages = getOrCreateSessionMessages(sid);
      const nextMessages = [...messages, newMsg];
      setSessionMessages(sid, nextMessages);
      if (displayedSessionIdRef.current === sid) {
        setLiveSessionMessages([...nextMessages]);
        liveMessagesRef.current = nextMessages;
      }
      return id;
    },
    [getOrCreateSessionMessages, setSessionMessages]
  );

  const seedSessionFromMessages = useCallback(
    (sid: string, initialMessages: Message[] | undefined, statusHint?: boolean) => {
      const shouldRun =
        typeof statusHint === "boolean"
          ? statusHint
          : sessionStatuses.find((session) => session.id === sid)?.status === "running";
      const state = getOrCreateSessionState(sid);
      if (typeof statusHint === "boolean") {
        setConnectionIntent(sid, statusHint);
      } else {
        clearConnectionIntent(sid);
      }
      if (initialMessages && initialMessages.length > 0) {
        const maxN = getMaxMessageId(initialMessages);
        nextIdRef.current = Math.max(nextIdRef.current, maxN);
        const deduped = deduplicateMessageIds(initialMessages);
        setSessionMessages(sid, [...deduped]);
        setSessionDraft(sid, "");
        setLiveSessionMessages([...deduped]);
        liveMessagesRef.current = deduped;
        skipReplayForSessionRef.current = sid;
      } else {
        setSessionMessages(sid, []);
        setSessionDraft(sid, "");
      }
      state.sessionState = shouldRun ? "running" : "idle";
      setSessionState(state.sessionState);

      setSessionId(sid);
      setSessionStateForSession(sid, state.sessionState);
      syncSessionToReact(sid);
      setConnected(false);

      // LRU: mark this session as recently used and evict oldest if over limit
      touchSession(sid);
      evictOldestSessions(
        sessionStatesRef.current,
        sessionMessagesRef.current,
        sessionDraftRef.current,
        sid,
      );
    },
    [
      clearConnectionIntent,
      deduplicateMessageIds,
      getOrCreateSessionState,
      sessionStatuses,
      setConnectionIntent,
      setSessionDraft,
      setSessionMessages,
      setSessionStateForSession,
      syncSessionToReact,
    ]
  );

  const loadSession = useCallback(
    (loadedMessages: Message[], sessionIdToResume?: string | null, statusHint?: boolean) => {
      if (__DEV__) console.log("[sse] loadSession", loadedMessages.length, "msgs", { sessionIdToResume, statusHint });
      if (sessionIdToResume && !sessionIdToResume.startsWith("temp-")) {
        if (activeSseRef.current && activeSseRef.current.id !== sessionIdToResume) {
          closeActiveSse("session-load");
        }
        seedSessionFromMessages(sessionIdToResume, loadedMessages, statusHint);
      }
    },
    [closeActiveSse, seedSessionFromMessages]
  );

  const deduplicateDenialsCallback = useCallback(deduplicateDenials, []);

  const recordToolUse = useCallback((id: string, data: { tool_name: string; tool_input?: Record<string, unknown> }) => {
    toolUseByIdRef.current.set(id, data);
  }, []);

  const getAndClearToolUse = useCallback((id: string) => {
    const m = toolUseByIdRef.current;
    const v = m.get(id);
    m.delete(id);
    return v ?? null;
  }, []);

  const addPermissionDenial = useCallback(
    (denial: PermissionDenial) => {
      setPermissionDenials((prev) => deduplicateDenialsCallback([...(prev ?? []), denial]));
    },
    [deduplicateDenialsCallback]
  );

  const recordToolUseRef = useRef(recordToolUse);
  const getAndClearToolUseRef = useRef(getAndClearToolUse);
  const addPermissionDenialRef = useRef(addPermissionDenial);
  const deduplicateDenialsRef = useRef(deduplicateDenialsCallback);
  recordToolUseRef.current = recordToolUse;
  getAndClearToolUseRef.current = getAndClearToolUse;
  addPermissionDenialRef.current = addPermissionDenial;
  deduplicateDenialsRef.current = deduplicateDenialsCallback;

  useChatExternalCallbacks({
    connected,
    sessionState,
    waitingForUserInput,
    permissionDenials,
    pendingAskQuestion,
    lastSessionTerminated,
    liveSessionMessages,
    onConnectedChange: options.onConnectedChange,
    onSessionRunningChange: options.onSessionRunningChange,
    onWaitingForUserInputChange: options.onWaitingForUserInputChange,
    onPermissionDenialsChange: options.onPermissionDenialsChange,
    onPendingAskQuestionChange: options.onPendingAskQuestionChange,
    onLastSessionTerminatedChange: options.onLastSessionTerminatedChange,
    onMessagesChange: options.onMessagesChange,
  });

  useChatStreamingLifecycle({
    serverUrl,
    sessionId,
    storeSessionId,
    sessionStatuses,
    skipReplayForSessionRef,
    nextIdRef,
    liveMessagesRef,
    outputBufferRef,
    sessionStatesRef,
    sessionMessagesRef,
    sessionDraftRef,
    activeSseRef,
    activeSseHandlersRef,
    suppressActiveSessionSwitchRef,
    selectedSessionRuntimeRef,
    connectionIntentBySessionRef,
    sawAgentEndRef,
    streamFlushTimeoutRef,
    displayedSessionIdRef,
    recordToolUseRef,
    getAndClearToolUseRef,
    addPermissionDenialRef,
    deduplicateDenialsRef,
    getOrCreateSessionState,
    getOrCreateSessionMessages,
    getSessionDraft,
    setSessionDraft,
    setSessionMessages,
    deduplicateMessageIds,
    getMaxMessageId,
    closeActiveSse,
    syncSessionToReact,
    getConnectionIntent,
    setConnectionIntent,
    clearConnectionIntent,
    setConnected,
    setSessionId,
    setLiveSessionMessages,
    setSessionState,
    setSessionStateForSession,
    setWaitingForUserInput,
    setPendingAskQuestion,
    setPermissionDenials,
    setLastSessionTerminated,
    setStoreSessionId,
    lastRunOptionsRef,
  });

  const {
    submitPrompt,
    submitAskQuestionAnswer,
    dismissAskQuestion,
    retryAfterPermission,
    dismissPermission,
    terminateAgent,
    resetSession,
    startNewSession,
  } = useChatActions({
    serverUrl,
    provider,
    model,
    sessionId,
    pendingAskQuestion,
    permissionDenials,
    lastRunOptionsRef,
    liveMessagesRef,
    pendingMessagesForNewSessionRef,
    outputBufferRef,
    displayedSessionIdRef,
    skipReplayForSessionRef,
    addMessage,
    deduplicateMessageIds,
    getOrCreateSessionState,
    getOrCreateSessionMessages,
    setSessionMessages,
    setSessionDraft,
    setSessionId,
    setLiveSessionMessages,
    setPermissionDenials,
    setPendingAskQuestion,
    setLastSessionTerminated,
    setWaitingForUserInput,
    setSessionStateForSession,
    setConnectionIntent,
    clearConnectionIntent,
    closeActiveSse,
  });

  return {
    sessionRunning: sessionState !== "idle",
    sessionId,
    submitPrompt,
    submitAskQuestionAnswer,
    dismissAskQuestion,
    retryAfterPermission,
    dismissPermission,
    terminateAgent,
    resetSession,
    startNewSession,
    loadSession,
  };
}
