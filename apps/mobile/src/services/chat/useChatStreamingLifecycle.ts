import { createEventDispatcher } from "@/services/providers/eventDispatcher";
import { isProviderStream, stripAnsi } from "@/services/providers/stream";
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type {
    LastRunOptions, Message,
    PendingAskUserQuestion,
    PermissionDenial,
} from "@/core/types";
import type {
    SessionRuntimeState
} from "./hooksTypes";
import { createSessionMessageHandlers } from "./sessionMessageHandlers";
import {
    SSE_MAX_RETRIES,
    attachSseHandlers,
    computeRetryDelay,
    detachSseHandlers,
    resolveEventSourceCtor,
    type SseEventHandlers,
} from "./sseConnection";
import {
    createStreamFlusher,
} from "./streamFlusher";
import { processRawSseLine } from "./sseMessageParser";
import type { UseSessionCache } from "./useSessionCache";


type UseChatStreamingLifecycleParams = {
  serverUrl: string;
  sessionId: string | null;
  storeSessionId: string | null;
  sessionStatuses: Array<{ id: string; status: string }>;
  sessionCache: UseSessionCache;
  skipReplayForSessionRef: MutableRefObject<string | null>;
  nextIdRef: MutableRefObject<number>;
  liveMessagesRef: MutableRefObject<Message[]>;
  outputBufferRef: MutableRefObject<string>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setLiveSessionMessages: Dispatch<SetStateAction<Message[]>>;
  setSessionState: Dispatch<SetStateAction<SessionRuntimeState>>;
  setWaitingForUserInput: Dispatch<SetStateAction<boolean>>;
  setPendingAskQuestion: Dispatch<SetStateAction<PendingAskUserQuestion | null>>;
  setPermissionDenials: Dispatch<SetStateAction<PermissionDenial[] | null>>;
  setLastSessionTerminated: Dispatch<SetStateAction<boolean>>;
  setStoreSessionId: (sessionId: string | null) => void;
  lastRunOptionsRef: MutableRefObject<LastRunOptions>;
};

/** Safety limit for outputBufferRef to prevent RangeError from unbounded string growth.
 *  5MB is well under Hermes' ~500MB limit but large enough for any legitimate partial line. */
const OUTPUT_BUFFER_MAX_SIZE = 5 * 1024 * 1024;

const resolveStreamUrl = (
  serverUrl: string,
  sessionId: string,
  skipReplayForSession: string | null
): { url: string; applySkipReplay: boolean } => {
  const baseUrl = `${serverUrl}/api/sessions/${sessionId}/stream?activeOnly=1`;
  const applySkipReplay = skipReplayForSession === sessionId;
  return {
    url: applySkipReplay ? `${baseUrl}&skipReplay=1` : baseUrl,
    applySkipReplay,
  };
};

export function useChatStreamingLifecycle(params: UseChatStreamingLifecycleParams) {
  const {
    serverUrl,
    sessionId,
    storeSessionId,
    sessionStatuses,
    sessionCache,
    skipReplayForSessionRef,
    nextIdRef,
    liveMessagesRef,
    outputBufferRef,
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
  } = params;
  const {
    syncSessionToReact,
    deduplicateMessageIds,
    getMaxMessageId,
    closeActiveSse,
    setSessionStateForSession,
    getConnectionIntent,
    getOrCreateSessionState,
    getOrCreateSessionMessages,
    getSessionDraft,
    setSessionDraft,
    setSessionMessages,
    displayedSessionIdRef,
    activeSseRef,
    activeSseHandlersRef,
    suppressActiveSessionSwitchRef,
    selectedSessionRuntimeRef,
    sawAgentEndRef,
    streamFlushTimeoutRef,
    recordToolUseRef,
    getAndClearToolUseRef,
    addPermissionDenialRef,
    deduplicateDenialsRef,
  } = sessionCache;

  // Derive a primitive boolean for the target session's running status.
  // sessionStatuses array changes identity every 3s poll, but this boolean
  // only changes when the session *actually* transitions — avoiding unnecessary
  // effect re-runs.
  const selectedSessionRuntime = selectedSessionRuntimeRef.current;
  const hasRuntimeRecordForTarget = selectedSessionRuntime?.id === storeSessionId;
  const isTargetSessionRunningFromStore = Boolean(
    storeSessionId && sessionStatuses.find((sessionStatus) => sessionStatus.id === storeSessionId)?.status === "running"
  );
  const isTargetSessionRunningFromRuntime = Boolean(hasRuntimeRecordForTarget && selectedSessionRuntime?.running);
  const isTargetSessionRunning = hasRuntimeRecordForTarget
    ? isTargetSessionRunningFromRuntime
    : isTargetSessionRunningFromStore;
  const streamFlushPerfRef = useRef({
    flushCount: 0,
    totalChars: 0,
    lastFlushAt: 0,
  });

  // ── Refresh from disk ─────────────────────────────────────────────────────

  const refreshCurrentSessionFromDisk = useCallback(
    async (sessionIdToRefresh: string | null) => {
      if (!sessionIdToRefresh || sessionIdToRefresh.startsWith("temp-")) return;
      // If there is an active draft, streaming hasn't finalized yet — skip to
      // avoid clobbering streamed content with a stale disk snapshot.
      const activeDraft = getSessionDraft(sessionIdToRefresh);
      if (activeDraft && activeDraft.length > 0) {
        if (__DEV__) {
          console.log("[sse] skipping disk refresh — active draft exists", { sessionId: sessionIdToRefresh, draftLen: activeDraft.length });
        }
        return;
      }
      try {
        const response = await fetch(`${serverUrl}/api/sessions/${encodeURIComponent(sessionIdToRefresh)}/messages`);
        if (!response.ok) return;
        const data = await response.json();
        const loadedMessages = Array.isArray(data?.messages) ? (data.messages as Message[]) : [];
        const state = getOrCreateSessionState(sessionIdToRefresh);
        const deduped = deduplicateMessageIds(loadedMessages);
        const maxN = getMaxMessageId(deduped);

        nextIdRef.current = Math.max(nextIdRef.current, maxN);
        setSessionMessages(sessionIdToRefresh, deduped);
        setSessionDraft(sessionIdToRefresh, "");
        state.sessionState = "idle";
        setSessionState(state.sessionState);

        if (displayedSessionIdRef.current === sessionIdToRefresh) {
          setLiveSessionMessages([...deduped]);
          liveMessagesRef.current = deduped;
          setSessionStateForSession(sessionIdToRefresh, "idle");
          setWaitingForUserInput(false);
          outputBufferRef.current = "";
        }
      } catch (error) {
        if (__DEV__) {
          console.warn("[sse] refresh session from disk failed", { sessionId: sessionIdToRefresh, error: String(error) });
        }
      }
    },
    [
      deduplicateMessageIds,
      getMaxMessageId,
      getOrCreateSessionState,
      getSessionDraft,
      setSessionDraft,
      setSessionMessages,
      serverUrl,
      setSessionStateForSession,
      setWaitingForUserInput,
      setSessionState,
      setLiveSessionMessages,
      liveMessagesRef,
      nextIdRef,
      displayedSessionIdRef,
      outputBufferRef,
    ]
  );

  // ── Main SSE lifecycle effect ─────────────────────────────────────────────

  useEffect(() => {
    const targetSessionId = storeSessionId;
    const targetSessionIntent = getConnectionIntent(targetSessionId);
    const targetSessionRunning = targetSessionId
      ? (targetSessionIntent ?? isTargetSessionRunning)
      : false;

    if (!targetSessionId || !targetSessionRunning) {
      closeActiveSse("inactive");
      selectedSessionRuntimeRef.current = {
        id: targetSessionId ?? null,
        running: false,
      };
      return;
    }
    selectedSessionRuntimeRef.current = { id: targetSessionId, running: true };

    syncSessionToReact(targetSessionId);

    // Handle session switch: close existing SSE if it's for a different session.
    if (activeSseRef.current && activeSseRef.current.id !== targetSessionId) {
      if (suppressActiveSessionSwitchRef.current) {
        suppressActiveSessionSwitchRef.current = false;
      } else {
        closeActiveSse("session-switch");
      }
    }

    // Already connected to the right session — just mark as connected.
    if (activeSseRef.current) {
      if (activeSseRef.current.id === targetSessionId) {
        setConnected(true);
      }
      return;
    }

    if (__DEV__) console.log("[sse] effect mount", { serverUrl, sessionId: targetSessionId });

    const activeSessionId = targetSessionId;
    const connectionSessionIdRef = { current: activeSessionId };

    const msgHandlers = createSessionMessageHandlers({
      sessionIdRef: connectionSessionIdRef,
      getOrCreateSessionState,
      getOrCreateSessionMessages,
      setSessionMessages,
      getSessionDraft,
      setSessionDraft,
      displayedSessionIdRef,
      setLiveSessionMessages,
      setSessionStateForSession,
      liveMessagesRef,
      nextIdRef,
    });

    const hasStreamEndedRef = { current: false };
    /** Guards against double finalization from effect cleanup + handleStreamEnd. */
    const hasFinalizedRef = { current: false };
    sawAgentEndRef.current = false;
    const retryCountRef = { current: 0 };
    const retryTimeoutRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    let isAborted = false;

    const clearRetryTimeout = () => {
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    const markAgentEnd = () => {
      if (sawAgentEndRef.current) return;
      sawAgentEndRef.current = true;
      const endedSessionId = connectionSessionIdRef.current;
      if (!endedSessionId) return;
      if (displayedSessionIdRef.current === endedSessionId) {
        setSessionStateForSession(endedSessionId, "idle");
        setWaitingForUserInput(false);
      }
    };

    const { url: streamUrl, applySkipReplay } = resolveStreamUrl(serverUrl, activeSessionId, skipReplayForSessionRef.current);
    if (applySkipReplay) {
      skipReplayForSessionRef.current = null;
    }
    const sse = new (resolveEventSourceCtor())(streamUrl);
    // Mutable ref so that scheduleRetry always cleans up the *current* SSE instance,
    // not the original one captured by closure (fixes zombie connection bug).
    const currentSseRef = { current: sse };
    activeSseRef.current = { id: activeSessionId, source: sse };

    // ── Session ID rekey (temp-* → real ID) ────────────────────────────────

    const setSessionIdWithRekey = (newId: string | null) => {
      const currentSessionId = connectionSessionIdRef.current;
      if (newId && newId !== currentSessionId && !newId.startsWith("temp-")) {
        sessionCache.rekeySessionData(currentSessionId, newId);
        connectionSessionIdRef.current = newId;
      }
      setSessionId(newId);
    };

    // ── Stream flusher ──────────────────────────────────────────────────────

    const flusher = createStreamFlusher(
      (chunk) => msgHandlers.appendAssistantTextForSession(chunk),
      () => getSessionDraft(connectionSessionIdRef.current),
      streamFlushTimeoutRef,
      __DEV__
        ? (chunk) => {
            const perf = streamFlushPerfRef.current;
            perf.flushCount += 1;
            perf.totalChars += chunk.length;
            const now = Date.now();
            const sinceLast = perf.lastFlushAt ? now - perf.lastFlushAt : 0;
            perf.lastFlushAt = now;
            const start = now;
            // Telemetry-only callback.
            if (perf.flushCount % 15 === 0) {
              console.debug("[stream] assistant flush", {
                flushCount: perf.flushCount,
                totalChars: perf.totalChars,
                sinceLastMs: sinceLast,
                appendMs: Date.now() - start,
                chunkLen: chunk.length,
              });
            }
          }
        : undefined,
    );

    // ── Event dispatcher ────────────────────────────────────────────────────

    const dispatchProviderEvent = createEventDispatcher({
      setPermissionDenials: (denials) => setPermissionDenials(denials ? deduplicateDenialsRef.current(denials) : null),
      setWaitingForUserInput: (waiting) => {
        if (displayedSessionIdRef.current === connectionSessionIdRef.current) {
          if (!sawAgentEndRef.current) {
            setSessionStateForSession(connectionSessionIdRef.current, "running");
          }
          setWaitingForUserInput(waiting);
        }
      },
      setPendingAskQuestion,
      setCurrentActivity: () => { /* not surfaced in mobile UI */ },
      addMessage: (role, content, codeRefs) => msgHandlers.addMessageForSession(role, content, codeRefs),
      appendAssistantText: (chunk) => flusher.queue(chunk),
      getCurrentAssistantContent: () => {
        // Include unflushed text so callers see the true real-time content.
        const draft = getSessionDraft(connectionSessionIdRef.current);
        return draft;
      },
      getLastMessageRole: () => {
        const messages = getOrCreateSessionMessages(connectionSessionIdRef.current);
        return messages.length ? messages[messages.length - 1]?.role ?? null : null;
      },
      getLastMessageContent: () => {
        const messages = getOrCreateSessionMessages(connectionSessionIdRef.current);
        const last = messages.length ? messages[messages.length - 1] : null;
        return (last?.content as string) ?? "";
      },
      deduplicateDenials: (denials) => deduplicateDenialsRef.current(denials),
      recordToolUse: (id, data) => recordToolUseRef.current(id, data),
      getAndClearToolUse: (id) => getAndClearToolUseRef.current(id),
      addPermissionDenial: (denial) => addPermissionDenialRef.current(denial),
      setSessionId: setSessionIdWithRekey,
    });

    // ── SSE event handlers ──────────────────────────────────────────────────

    /** Snapshot of message count when SSE opens; used to detect empty streams. */
    let messageCountAtSseOpen = 0;

    const openHandler = () => {
      hasStreamEndedRef.current = false;
      const currentSessionId = connectionSessionIdRef.current;
      messageCountAtSseOpen = currentSessionId ? getOrCreateSessionMessages(currentSessionId).length : 0;
      retryCountRef.current = 0;
      clearRetryTimeout();
      if (__DEV__) console.log("[sse] connected", { sessionId: connectionSessionIdRef.current });
      setConnected(true);
    };

    const scheduleRetry = () => {
      if (isAborted) return;
      if (retryCountRef.current >= SSE_MAX_RETRIES) {
        if (__DEV__) console.log("[sse] max retries reached, giving up", { sessionId: connectionSessionIdRef.current });
        if (displayedSessionIdRef.current === connectionSessionIdRef.current) {
          setConnected(false);
        }
        return;
      }
      const delay = computeRetryDelay(retryCountRef.current);
      retryCountRef.current += 1;
      if (__DEV__)
        console.log("[sse] scheduling retry", {
          attempt: retryCountRef.current,
          delayMs: delay,
          sessionId: connectionSessionIdRef.current,
        });

      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        if (isAborted) return;

        detachSseHandlers(currentSseRef.current, sseHandlers);
        currentSseRef.current.close();

        const { url: retryUrl } = resolveStreamUrl(serverUrl, connectionSessionIdRef.current, null);
        const retrySse = new (resolveEventSourceCtor())(retryUrl);
        currentSseRef.current = retrySse;
        activeSseRef.current = { id: connectionSessionIdRef.current, source: retrySse };

        attachSseHandlers(retrySse, sseHandlers);
        activeSseHandlersRef.current = sseHandlers;
      }, delay);
    };

    const errorHandler = (err: unknown) => {
      const eventError = err as { xhrStatus?: number; xhrState?: number; message?: string };
      const isExpectedServerClose =
        eventError?.xhrStatus === 200 &&
        eventError?.xhrState === 4 &&
        (typeof eventError?.message === "string" && eventError.message.toLowerCase().includes("connection abort"));
      if (isExpectedServerClose) {
        if (__DEV__) console.log("[sse] stream ended (server closed)", { sessionId: connectionSessionIdRef.current });
        handleStreamEnd({}, 0);
        return;
      }
      if (__DEV__) console.log("[sse] disconnected (error), will retry", { sessionId: connectionSessionIdRef.current, err });
      scheduleRetry();
    };

    const messageHandler = (event: any) => {
      if (event.data == null) return;

      const dataStr = event.data;
      const dataStrLen = typeof dataStr === "string" ? dataStr.length : 0;

      // Safety valve: prevent RangeError from unbounded buffer growth.
      if (outputBufferRef.current.length + dataStrLen + 1 > OUTPUT_BUFFER_MAX_SIZE) {
        console.warn("[sse] outputBuffer exceeded safety limit, resetting", {
          bufferLen: outputBufferRef.current.length,
          dataStrLen,
          limit: OUTPUT_BUFFER_MAX_SIZE,
        });
        outputBufferRef.current = "";
        return;
      }

      outputBufferRef.current += dataStr + "\n";

      let lines: string[];
      try {
        lines = outputBufferRef.current.split("\n");
        outputBufferRef.current = lines.pop() ?? "";
      } catch (splitErr) {
        console.error("[sse][DIAG] RangeError on buffer split", {
          bufferLen: outputBufferRef.current.length,
          error: String(splitErr),
        });
        outputBufferRef.current = "";
        return;
      }

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const actions = (() => {
          try {
            return processRawSseLine(trimmed);
          } catch (error) {
            if (__DEV__) console.error("[sse][DIAG] processRawSseLine threw unexpectedly", { error });
            return null;
          }
        })();

        if (!actions) continue;

        const actionList = Array.isArray(actions) ? actions : [actions];
        for (const action of actionList) {
          switch (action.kind) {
            case "skip":
              break;
            case "agentEnd":
              if (__DEV__) console.log("[stream] agent_end event received");
              markAgentEnd();
              break;
            case "sessionStarted":
              if (__DEV__) console.log("[sse][DIAG] session-started matched", {
                displayedSid: displayedSessionIdRef.current,
                connSid: connectionSessionIdRef.current,
              });
              hasStreamEndedRef.current = false;
              setLastSessionTerminated(false);
              if (displayedSessionIdRef.current === connectionSessionIdRef.current) {
                setSessionStateForSession(connectionSessionIdRef.current, "running");
                setWaitingForUserInput(false);
                setLastSessionTerminated(false);
              }
              if (action.sessionId) {
                setSessionIdWithRekey(action.sessionId);
              }
              lastRunOptionsRef.current = {
                permissionMode: action.permissionMode,
                allowedTools: action.allowedTools,
                useContinue: action.useContinue,
              };
              break;
            case "sessionRekey":
              if (__DEV__) console.log("[sse][DIAG] session rekey", {
                from: connectionSessionIdRef.current,
                to: action.sessionId,
              });
              setSessionIdWithRekey(action.sessionId);
              break;
            case "providerEvent":
              try {
                dispatchProviderEvent(action.data);
              } catch (dispatchErr) {
                console.error("[sse][DIAG] RangeError in dispatchProviderEvent", {
                  type: action.data.type,
                  error: String(dispatchErr),
                });
              }
              break;
            case "assistantText":
              try {
                flusher.queue(action.text);
              } catch (queueErr) {
                console.error("[sse][DIAG] RangeError in flusher.queue", { error: String(queueErr) });
              }
              break;
          }
        }
      }
    };

    const handleStreamEnd = (event: { data?: string }, exitCodeDefault = 0) => {
      if (hasStreamEndedRef.current) return;
      hasStreamEndedRef.current = true;

      let exitCode = exitCodeDefault;
      try {
        if (event?.data) {
          const parsed = JSON.parse(event.data);
          exitCode = parsed.exitCode ?? exitCodeDefault;
        }
      } catch {}

      if (displayedSessionIdRef.current === connectionSessionIdRef.current) {
        setLastSessionTerminated(exitCode !== 0);
        setSessionStateForSession(connectionSessionIdRef.current, "idle");
        setWaitingForUserInput(false);
      }

      // Flush any remaining partial line in the output buffer (last chunk may not end with \n).
      const remainingBuffer = outputBufferRef.current.trim();
      if (remainingBuffer) {
        outputBufferRef.current = "";
        const clean = stripAnsi(remainingBuffer);
        if (clean) {
          try {
            const parsed = JSON.parse(clean);
            if (isProviderStream(parsed)) {
              dispatchProviderEvent(parsed as Record<string, unknown>);
            } else if (typeof parsed === "object" && parsed != null && "type" in parsed) {
              // Known typed event but not a provider stream — skip
            } else {
              flusher.queue(clean + "\n");
            }
          } catch {
            flusher.queue(clean + "\n");
          }
        }
      }

      flusher.cancel();
      flusher.flush();
      hasFinalizedRef.current = true;
      msgHandlers.finalizeAssistantMessageForSession();
      closeActiveSse("stream-end");

      // If no new messages were produced, refresh from disk to pick up any
      // messages completed since the last REST load.
      const endedSessionId = connectionSessionIdRef.current;
      if (endedSessionId && exitCode === 0) {
        const currentMessages = getOrCreateSessionMessages(endedSessionId);
        const currentDraft = getSessionDraft(endedSessionId);
        const hasNewContent = currentMessages.length > messageCountAtSseOpen || (currentDraft && currentDraft.length > 0);
        if (!hasNewContent) {
          void refreshCurrentSessionFromDisk(endedSessionId);
        }
      }
    };

    const endHandler = (event: any) => handleStreamEnd(event, 0);
    const doneHandler = (event: any) => handleStreamEnd(event ?? {}, 0);

    const sseHandlers: SseEventHandlers = {
      open: openHandler,
      error: errorHandler,
      message: messageHandler,
      end: endHandler,
      done: doneHandler,
    };

    activeSseHandlersRef.current = sseHandlers;
    attachSseHandlers(sse, sseHandlers);

    return () => {
      isAborted = true;
      clearRetryTimeout();
      // Flush pending text before the effect is abandoned (queued text would be lost on re-run).
      flusher.cancel();
      flusher.flush();
      // Only finalize if handleStreamEnd hasn't already done so to avoid double finalize.
      if (!hasFinalizedRef.current) {
        msgHandlers.finalizeAssistantMessageForSession();
      }
    };
  }, [
    closeActiveSse,
    getOrCreateSessionState,
    refreshCurrentSessionFromDisk,
    setSessionStateForSession,
    getConnectionIntent,
    isTargetSessionRunning,
    storeSessionId,
    serverUrl,
    syncSessionToReact,
    setSessionId,
    setConnected,
    getOrCreateSessionMessages,
    setSessionMessages,
    getSessionDraft,
    setSessionDraft,
    setLiveSessionMessages,
    setWaitingForUserInput,
    setPermissionDenials,
    setPendingAskQuestion,
    setLastSessionTerminated,
  ]);

  // ── Secondary effects ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => closeActiveSse("unmount");
  }, [closeActiveSse]);

  useEffect(() => {
    if (sessionId) {
      syncSessionToReact(sessionId);
    } else {
      setConnected(false);
    }
  }, [sessionId, syncSessionToReact, setConnected]);

  useEffect(() => {
    setStoreSessionId(sessionId);
  }, [sessionId, setStoreSessionId]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active" && sessionId) {
        syncSessionToReact(sessionId);
      }
    });
    return () => sub.remove();
  }, [sessionId, syncSessionToReact]);
}
