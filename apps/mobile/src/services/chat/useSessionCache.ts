import type { PermissionDenial, Message } from "@/core/types";
import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { deduplicateDenials, deduplicateMessageIds as deduplicateMessageIdsUtil, getMaxMessageId } from "./hooksUtils";
import type { SseEventHandlers } from "./sseConnection";
import type { EventSourceLike, SessionLiveState, SessionRuntimeState } from "./hooksTypes";
import {
  evictOldestSessions as evictOldestSessionsFromCache,
  getOrCreateSessionMessages as getOrCreateSessionMessagesFromCache,
  getOrCreateSessionState as getOrCreateSessionStateFromCache,
  getSessionDraft as getSessionDraftFromCache,
  moveSessionCacheData,
  setSessionDraft as setSessionDraftFromCache,
  setSessionMessages as setSessionMessagesFromCache,
  touchSession,
} from "./sessionCacheHelpers";

type SessionToolUse = { tool_name: string; tool_input?: Record<string, unknown> };

export interface UseSessionCache {
  sessionStatesRef: MutableRefObject<Map<string, SessionLiveState>>;
  sessionMessagesRef: MutableRefObject<Map<string, Message[]>>;
  sessionDraftRef: MutableRefObject<Map<string, string>>;
  activeSseRef: MutableRefObject<{ id: string; source: EventSourceLike } | null>;
  activeSseHandlersRef: MutableRefObject<SseEventHandlers | null>;
  suppressActiveSessionSwitchRef: MutableRefObject<boolean>;
  selectedSessionRuntimeRef: MutableRefObject<{ id: string | null; running: boolean } | null>;
  connectionIntentBySessionRef: MutableRefObject<Map<string, boolean>>;
  sawAgentEndRef: MutableRefObject<boolean>;
  streamFlushTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  displayedSessionIdRef: MutableRefObject<string | null>;
  currentSessionIdRef: MutableRefObject<string | null>;
  skipReplayForSessionRef: MutableRefObject<string | null>;
  outputBufferRef: MutableRefObject<string>;
  nextIdRef: MutableRefObject<number>;
  liveMessagesRef: MutableRefObject<Message[]>;
  recordToolUseRef: MutableRefObject<(id: string, data: SessionToolUse) => void>;
  getAndClearToolUseRef: MutableRefObject<(id: string) => SessionToolUse | null>;
  addPermissionDenialRef: MutableRefObject<(denial: PermissionDenial) => void>;
  deduplicateDenialsRef: MutableRefObject<(denials: PermissionDenial[]) => PermissionDenial[]>;
  getOrCreateSessionState: (sessionId: string) => SessionLiveState;
  getOrCreateSessionMessages: (sessionId: string) => Message[];
  getSessionDraft: (sessionId: string) => string;
  setSessionDraft: (sessionId: string, draft: string) => void;
  setSessionMessages: (sessionId: string, messages: Message[]) => void;
  deduplicateMessageIds: (messages: Message[]) => Message[];
  setSessionStateForSession: (sessionId: string | null, next: SessionRuntimeState) => void;
  syncSessionToReact: (sessionId: string | null) => void;
  getConnectionIntent: (sessionId: string | null) => boolean | undefined;
  setConnectionIntent: (sessionId: string | null, shouldConnect: boolean) => void;
  clearConnectionIntent: (sessionId: string | null) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  closeActiveSse: (reason?: string) => void;
  evictOldestSessions: (activeSessionId?: string | null) => void;
  touchSession: (sessionId: string) => void;
  rekeySessionData: (currentSessionId: string, nextSessionId: string) => void;
  recordToolUse: (id: string, data: SessionToolUse) => void;
  getAndClearToolUse: (id: string) => SessionToolUse | null;
  addPermissionDenial: (denial: PermissionDenial) => void;
  deduplicateDenials: (denials: PermissionDenial[]) => PermissionDenial[];
  getMaxMessageId: (messages: Message[]) => number;
}

type UseSessionCacheArgs = {
  setSessionState: Dispatch<SetStateAction<SessionRuntimeState>>;
  setWaitingForUserInput: Dispatch<SetStateAction<boolean>>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setLiveSessionMessages: Dispatch<SetStateAction<Message[]>>;
};

export function useSessionCache({
  setSessionState,
  setWaitingForUserInput,
  setConnected,
  setLiveSessionMessages,
}: UseSessionCacheArgs): UseSessionCache {
  const activeSseRef = useRef<{ id: string; source: EventSourceLike } | null>(null);
  const activeSseHandlersRef = useRef<SseEventHandlers | null>(null);
  const suppressActiveSessionSwitchRef = useRef(false);
  const selectedSessionRuntimeRef = useRef<{ id: string | null; running: boolean } | null>(null);
  const connectionIntentBySessionRef = useRef<Map<string, boolean>>(new Map());
  const sawAgentEndRef = useRef(false);
  const streamFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedSessionIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const skipReplayForSessionRef = useRef<string | null>(null);
  const outputBufferRef = useRef("");
  const nextIdRef = useRef(0);
  const liveMessagesRef = useRef<Message[]>([]);

  const sessionStatesRef = useRef<Map<string, SessionLiveState>>(new Map());
  const sessionMessagesRef = useRef<Map<string, Message[]>>(new Map());
  const sessionDraftRef = useRef<Map<string, string>>(new Map());
  const toolUseByIdRef = useRef<Map<string, SessionToolUse>>(new Map());

  const recordToolUseRef = useRef<(id: string, data: SessionToolUse) => void>(() => {});
  const getAndClearToolUseRef = useRef<(id: string) => SessionToolUse | null>((_) => null);
  const addPermissionDenialRef = useRef<(denial: PermissionDenial) => void>((_) => {});
  const deduplicateDenialsRef = useRef<(denials: PermissionDenial[]) => PermissionDenial[]>((denials) => deduplicateDenials(denials));

  const getOrCreateSessionState = useCallback((sessionId: string): SessionLiveState => {
    return getOrCreateSessionStateFromCache(sessionStatesRef.current, sessionId);
  }, []);

  const getOrCreateSessionMessages = useCallback(
    (sessionId: string): Message[] => getOrCreateSessionMessagesFromCache(sessionMessagesRef.current, sessionId),
    []
  );

  const getSessionDraft = useCallback(
    (sessionId: string): string => getSessionDraftFromCache(sessionDraftRef.current, sessionId),
    []
  );

  const setSessionDraft = useCallback(
    (sessionId: string, draft: string) => setSessionDraftFromCache(sessionDraftRef.current, sessionId, draft),
    []
  );

  const setSessionMessages = useCallback(
    (sessionId: string, messages: Message[]) => setSessionMessagesFromCache(sessionMessagesRef.current, sessionId, messages),
    []
  );

  const setSessionStateForSession = useCallback(
    (sessionId: string | null, next: SessionRuntimeState) => {
      if (!sessionId) {
        setSessionState(next);
        return;
      }
      const state = getOrCreateSessionState(sessionId);
      state.sessionState = next;
      if (displayedSessionIdRef.current === sessionId) {
        setSessionState(next);
      }
    },
    [getOrCreateSessionState, setSessionState]
  );

  const getMaxMessageIdFromCache = useCallback((messages: Message[]): number => getMaxMessageId(messages), []);

  const deduplicateMessageIds = useCallback((messages: Message[]): Message[] => {
    return deduplicateMessageIdsUtil(messages, nextIdRef);
  }, []);

  const syncSessionToReact = useCallback(
    (sessionId: string | null) => {
      if (!sessionId) return;
      const sessionStateEntry = sessionStatesRef.current.get(sessionId);
      const messages = getOrCreateSessionMessages(sessionId);
      if (sessionStateEntry) {
        setLiveSessionMessages(messages);
        setSessionState(sessionStateEntry.sessionState);
        outputBufferRef.current = "";
        liveMessagesRef.current = messages;
      } else {
        const isDisplayedSession = displayedSessionIdRef.current === sessionId;
        const hasDisplayedMessages = liveMessagesRef.current.length > 0;
        if (!(isDisplayedSession && hasDisplayedMessages)) {
          setLiveSessionMessages([]);
          liveMessagesRef.current = [];
        }
        setSessionState("idle");
        setWaitingForUserInput(false);
      }
    },
    [getOrCreateSessionMessages, setLiveSessionMessages, setSessionState, setWaitingForUserInput]
  );

  const getConnectionIntent = useCallback((sessionId: string | null): boolean | undefined => {
    if (!sessionId) return undefined;
    return connectionIntentBySessionRef.current.get(sessionId);
  }, []);

  const setConnectionIntent = useCallback((sessionId: string | null, shouldConnect: boolean) => {
    if (!sessionId) return;
    if (shouldConnect) {
      connectionIntentBySessionRef.current.set(sessionId, true);
      return;
    }
    connectionIntentBySessionRef.current.delete(sessionId);
  }, []);

  const clearConnectionIntent = useCallback((sessionId: string | null) => {
    if (!sessionId) return;
    connectionIntentBySessionRef.current.delete(sessionId);
  }, []);

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
          setSessionStateForSession(id, "idle");
          setWaitingForUserInput(false);
        } else if (reason !== "session-switch" && reason !== "session-load" && reason !== "new-session") {
          setSessionStateForSession(id, "idle");
          setWaitingForUserInput(false);
        }
      }
      suppressActiveSessionSwitchRef.current = false;
      if (streamFlushTimeoutRef.current) {
        clearTimeout(streamFlushTimeoutRef.current);
        streamFlushTimeoutRef.current = null;
      }
      clearConnectionIntent(id);
      toolUseByIdRef.current.clear();
      setConnected(false);
    },
    [setSessionStateForSession, setWaitingForUserInput, clearConnectionIntent, setConnected]
  );

  const setCurrentSessionId = useCallback((sessionId: string | null) => {
    currentSessionIdRef.current = sessionId;
    displayedSessionIdRef.current = sessionId;
    liveMessagesRef.current = sessionId ? getOrCreateSessionMessages(sessionId) : [];
  }, [getOrCreateSessionMessages]);

  const evictOldestSessions = useCallback(
    (activeSessionId?: string | null) => {
      evictOldestSessionsFromCache(
        sessionStatesRef.current,
        sessionMessagesRef.current,
        sessionDraftRef.current,
        activeSessionId,
      );
    },
    []
  );

  const touchSessionInCache = useCallback((sessionId: string) => {
    touchSession(sessionId);
  }, []);

  const rekeySessionData = useCallback((currentSessionId: string, nextSessionId: string) => {
    if (!currentSessionId || currentSessionId === nextSessionId || nextSessionId.startsWith("temp-")) {
      return;
    }

    moveSessionCacheData(currentSessionId, nextSessionId, sessionStatesRef.current, sessionMessagesRef.current, sessionDraftRef.current);
    const selectedSessionRuntime = selectedSessionRuntimeRef.current;
    if (selectedSessionRuntime?.id === currentSessionId) {
      selectedSessionRuntimeRef.current = { ...selectedSessionRuntime, id: nextSessionId };
    }
    const intent = connectionIntentBySessionRef.current.get(currentSessionId);
    if (intent !== undefined) {
      connectionIntentBySessionRef.current.delete(currentSessionId);
      connectionIntentBySessionRef.current.set(nextSessionId, intent);
    }
    if (displayedSessionIdRef.current === currentSessionId) {
      displayedSessionIdRef.current = nextSessionId;
    }
    if (activeSseRef.current && activeSseRef.current.id === currentSessionId) {
      activeSseRef.current.id = nextSessionId;
      suppressActiveSessionSwitchRef.current = true;
    }
  }, []);

  const recordToolUse = useCallback((id: string, data: SessionToolUse) => {
    toolUseByIdRef.current.set(id, data);
  }, []);

  const getAndClearToolUse = useCallback((id: string) => {
    const data = toolUseByIdRef.current.get(id) ?? null;
    if (data) {
      toolUseByIdRef.current.delete(id);
    }
    return data;
  }, []);

  const addPermissionDenial = useCallback(
    (denial: PermissionDenial) => addPermissionDenialRef.current(denial),
    []
  );

  const deduplicateDenials = useCallback((denials: PermissionDenial[]) => {
    return deduplicateDenialsRef.current(denials);
  }, []);

  return {
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
    currentSessionIdRef,
    skipReplayForSessionRef,
    outputBufferRef,
    nextIdRef,
    liveMessagesRef,
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
    setSessionStateForSession,
    syncSessionToReact,
    getConnectionIntent,
    setConnectionIntent,
    clearConnectionIntent,
    setCurrentSessionId,
    closeActiveSse,
    evictOldestSessions,
    touchSession: touchSessionInCache,
    rekeySessionData,
    recordToolUse,
    getAndClearToolUse,
    addPermissionDenial,
    deduplicateDenials,
    getMaxMessageId: getMaxMessageIdFromCache,
  };
}
