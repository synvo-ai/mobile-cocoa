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
import { getDefaultModelForProvider } from "@/services/server/modelsApi";
import type { SessionRuntimeState, UseChatOptions } from "./hooksTypes";
import {
  deduplicateDenials,
} from "./hooksUtils";
import { useSessionCache } from "./useSessionCache";
import { useChatActions } from "./useChatActions";
import { useChatExternalCallbacks } from "./useChatExternalCallbacks";
import { useChatStreamingLifecycle } from "./useChatStreamingLifecycle";

// Re-export commonly consumed chat types for UI layers.
export type { Message, PermissionDenial, PendingAskUserQuestion };

export function useChat(options: UseChatOptions = {}) {
  const serverConfig = options.serverConfig ?? getDefaultServerConfig();
  const serverUrl = serverConfig.getBaseUrl();
  const provider = options.provider ?? "codex";

  const defaultModel = getDefaultModelForProvider(provider);
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
  const sessionCache = useSessionCache({
    setSessionState,
    setWaitingForUserInput,
    setConnected,
    setLiveSessionMessages,
  });
  sessionCache.setCurrentSessionId(sessionId);

  const sessionStatuses = useSessionManagementStore((state) => state.sessionStatuses);
  const storeSessionId = useSessionManagementStore((state) => state.sessionId);
  const setStoreSessionId = useSessionManagementStore((state) => state.setSessionId);

  const deduplicateMessageIds = sessionCache.deduplicateMessageIds;
  const { setConnectionIntent, clearConnectionIntent, syncSessionToReact } = sessionCache;
  const {
    getOrCreateSessionState,
    getOrCreateSessionMessages,
    setSessionDraft,
    setSessionMessages,
    setSessionStateForSession,
    touchSession,
    evictOldestSessions,
    activeSseRef,
    displayedSessionIdRef,
    skipReplayForSessionRef,
    outputBufferRef,
    nextIdRef,
    liveMessagesRef,
    currentSessionIdRef,
    closeActiveSse,
  } = sessionCache;

  const pendingMessagesForNewSessionRef = useRef<Message[]>([]);

  const addMessage = useCallback(
    (role: Message["role"], content: string, codeReferences?: CodeReference[]) => {
      const currentSessionId = currentSessionIdRef.current;
      const id = `msg-${++nextIdRef.current}`;
      const newMsg: Message = { id, role, content, codeReferences };
      if (!currentSessionId) {
        setLiveSessionMessages((prev) => [...prev, newMsg]);
        pendingMessagesForNewSessionRef.current = [...pendingMessagesForNewSessionRef.current, newMsg];
        return id;
      }
      const messages = getOrCreateSessionMessages(currentSessionId);
      const nextMessages = [...messages, newMsg];
      setSessionMessages(currentSessionId, nextMessages);
      if (displayedSessionIdRef.current === currentSessionId) {
        setLiveSessionMessages([...nextMessages]);
        liveMessagesRef.current = nextMessages;
      }
      return id;
    },
    [getOrCreateSessionMessages, setSessionMessages]
  );

  const seedSessionFromMessages = useCallback(
    (sessionIdToSeed: string, initialMessages: Message[] | undefined, statusHint?: boolean) => {
      const shouldRun =
        typeof statusHint === "boolean"
          ? statusHint
          : sessionStatuses.find((session) => session.id === sessionIdToSeed)?.status === "running";
      const state = getOrCreateSessionState(sessionIdToSeed);
      if (typeof statusHint === "boolean") {
        setConnectionIntent(sessionIdToSeed, statusHint);
      } else {
        clearConnectionIntent(sessionIdToSeed);
      }
      if (initialMessages && initialMessages.length > 0) {
        const maxN = sessionCache.getMaxMessageId(initialMessages);
        nextIdRef.current = Math.max(nextIdRef.current, maxN);
        const deduped = deduplicateMessageIds(initialMessages);
        setSessionMessages(sessionIdToSeed, [...deduped]);
        // When the session is running and the last message is from the assistant,
        // initialize the draft with that content so incoming SSE deltas append
        // to it instead of replacing it. Without this, the first live delta
        // overwrites the REST-loaded assistant content with just the new chunk.
        const lastMsg = deduped[deduped.length - 1];
        const seedDraft = shouldRun && lastMsg?.role === "assistant" && typeof lastMsg.content === "string"
          ? lastMsg.content
          : "";
        setSessionDraft(sessionIdToSeed, seedDraft);
        setLiveSessionMessages([...deduped]);
        liveMessagesRef.current = deduped;
        skipReplayForSessionRef.current = sessionIdToSeed;
      } else {
        setSessionMessages(sessionIdToSeed, []);
        setSessionDraft(sessionIdToSeed, "");
      }
      state.sessionState = shouldRun ? "running" : "idle";
      setSessionState(state.sessionState);

      setSessionId(sessionIdToSeed);
      setSessionStateForSession(sessionIdToSeed, state.sessionState);
      syncSessionToReact(sessionIdToSeed);
      setConnected(false);

      // LRU: mark this session as recently used and evict oldest if over limit
      touchSession(sessionIdToSeed);
      evictOldestSessions(sessionIdToSeed);
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
    sessionCache.recordToolUse(id, data);
  }, []);

  const getAndClearToolUse = useCallback((id: string) => {
    return sessionCache.getAndClearToolUse(id);
  }, []);

  const addPermissionDenial = useCallback(
    (denial: PermissionDenial) => {
      setPermissionDenials((prev) => deduplicateDenialsCallback([...(prev ?? []), denial]));
    },
    [deduplicateDenialsCallback]
  );

  sessionCache.recordToolUseRef.current = recordToolUse;
  sessionCache.getAndClearToolUseRef.current = getAndClearToolUse;
  sessionCache.addPermissionDenialRef.current = addPermissionDenial;
  sessionCache.deduplicateDenialsRef.current = deduplicateDenialsCallback;

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
    sessionCache,
    skipReplayForSessionRef,
    nextIdRef,
    liveMessagesRef: sessionCache.liveMessagesRef,
    outputBufferRef: sessionCache.outputBufferRef,
    setConnected,
    setSessionId,
    setLiveSessionMessages,
    setSessionState,
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
    sessionCache,
    lastRunOptionsRef,
    liveMessagesRef,
    pendingMessagesForNewSessionRef,
    outputBufferRef,
    displayedSessionIdRef,
    skipReplayForSessionRef,
    addMessage,
    setSessionId,
    setLiveSessionMessages,
    setWaitingForUserInput,
    setPermissionDenials,
    setPendingAskQuestion,
    setLastSessionTerminated,
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
