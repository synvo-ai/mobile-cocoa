import { createEventDispatcher } from "@/services/providers/eventDispatcher";
import {
    isProviderStream,
    isProviderSystemNoise, stripAnsi
} from "@/services/providers/stream";
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { AppState, type AppStateStatus } from "react-native";
import EventSource from "react-native-sse";
import { resolveStreamUrl } from "./chatHookHelpers";
import type {
    EventSourceCtor, EventSourceLike, LastRunOptions, Message,
    PendingAskUserQuestion,
    PermissionDenial,
    SessionLiveState,
    SessionRuntimeState
} from "./hooks-types";
import { moveSessionCacheData } from "./sessionCacheHelpers";
import { createSessionMessageHandlers } from "./sessionMessageHandlers";

type UseChatStreamingLifecycleParams = {
  serverUrl: string;
  sessionId: string | null;
  storeSessionId: string | null;
  sessionStatuses: Array<{ id: string; status: string }>;
  skipReplayForSessionRef: MutableRefObject<string | null>;
  nextIdRef: MutableRefObject<number>;
  liveMessagesRef: MutableRefObject<Message[]>;
  outputBufferRef: MutableRefObject<string>;
  sessionStatesRef: MutableRefObject<Map<string, SessionLiveState>>;
  sessionMessagesRef: MutableRefObject<Map<string, Message[]>>;
  sessionDraftRef: MutableRefObject<Map<string, string>>;
  activeSseRef: MutableRefObject<{ id: string; source: EventSourceLike } | null>;
  activeSseHandlersRef: MutableRefObject<{
    open: (event: unknown) => void;
    error: (event: unknown) => void;
    message: (event: any) => void;
    end: (event: any) => void;
    done: (event: any) => void;
  } | null>;
  suppressActiveSessionSwitchRef: MutableRefObject<boolean>;
  selectedSessionRuntimeRef: MutableRefObject<{ id: string | null; running: boolean } | null>;
  connectionIntentBySessionRef: MutableRefObject<Map<string, boolean>>;
  sawAgentEndRef: MutableRefObject<boolean>;
  streamFlushTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  displayedSessionIdRef: MutableRefObject<string | null>;
  recordToolUseRef: MutableRefObject<(id: string, data: { tool_name: string; tool_input?: Record<string, unknown> }) => void>;
  getAndClearToolUseRef: MutableRefObject<(id: string) => { tool_name: string; tool_input?: Record<string, unknown> } | null>;
  addPermissionDenialRef: MutableRefObject<(denial: PermissionDenial) => void>;
  deduplicateDenialsRef: MutableRefObject<(denials: PermissionDenial[]) => PermissionDenial[]>;
  getOrCreateSessionState: (sid: string) => SessionLiveState;
  getOrCreateSessionMessages: (sid: string) => Message[];
  getSessionDraft: (sid: string) => string;
  setSessionDraft: (sid: string, draft: string) => void;
  setSessionMessages: (sid: string, messages: Message[]) => void;
  deduplicateMessageIds: (messages: Message[]) => Message[];
  getMaxMessageId: (messages: Message[]) => number;
  closeActiveSse: (reason?: string) => void;
  syncSessionToReact: (sid: string | null) => void;
  getConnectionIntent: (sid: string | null) => boolean | undefined;
  setConnectionIntent: (sid: string | null, shouldConnect: boolean) => void;
  clearConnectionIntent: (sid: string | null) => void;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setLiveSessionMessages: Dispatch<SetStateAction<Message[]>>;
  setSessionState: Dispatch<SetStateAction<SessionRuntimeState>>;
  setSessionStateForSession: (sid: string | null, next: SessionRuntimeState) => void;
  setWaitingForUserInput: Dispatch<SetStateAction<boolean>>;
  setPendingAskQuestion: Dispatch<SetStateAction<PendingAskUserQuestion | null>>;
  setPermissionDenials: Dispatch<SetStateAction<PermissionDenial[] | null>>;
  setLastSessionTerminated: Dispatch<SetStateAction<boolean>>;
  setStoreSessionId: (sid: string | null) => void;
  lastRunOptionsRef: MutableRefObject<LastRunOptions>;
};

const STREAM_FLUSH_INTERVAL_MS = 50;
const STREAM_FLUSH_INTERVAL_LARGE_MS = 95;
const STREAM_FLUSH_DRAFT_THRESHOLD = 2400;
const STREAM_BOUNDARY_MARKER = /[.!?;,\n]/;

const SSE_MAX_RETRIES = 5;
const SSE_RETRY_BASE_MS = 1000;
/** Safety limit for outputBufferRef to prevent RangeError from unbounded string growth.
 *  5MB is well under Hermes' ~500MB limit but large enough for any legitimate partial line. */
const OUTPUT_BUFFER_MAX_SIZE = 5 * 1024 * 1024;

/** Resolve the EventSource constructor across CJS/ESM module shapes. */
function resolveEventSourceCtor(): EventSourceCtor {
  return ((EventSource as unknown as { default?: EventSourceCtor }).default ??
    (EventSource as EventSourceCtor)) as EventSourceCtor;
}

export function useChatStreamingLifecycle(params: UseChatStreamingLifecycleParams) {
  const {
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
  } = params;

  // Derive a primitive boolean for the target session's running status.
  // This replaces the volatile `isSessionManagedRunning` callback in the dep array:
  // sessionStatuses array changes identity every 3s poll (lastAccess/mtime), but
  // this boolean only changes when the target session *actually* transitions.
  const isTargetSessionRunning = Boolean(
    storeSessionId && sessionStatuses.find((s) => s.id === storeSessionId)?.status === "running"
  );
  const streamFlushPerfRef = useRef({
    flushCount: 0,
    totalChars: 0,
    lastFlushAt: 0,
  });

  const refreshCurrentSessionFromDisk = useCallback(
    async (sid: string | null) => {
      if (!sid || sid.startsWith("temp-")) return;
      // If there is an active draft for this session, streaming hasn't finalized yet.
      // The in-memory data is more current than what's on disk — skip the refresh
      // to avoid clobbering streamed content with a stale disk snapshot.
      const activeDraft = getSessionDraft(sid);
      if (activeDraft && activeDraft.length > 0) {
        if (__DEV__) {
          console.log("[sse] skipping disk refresh — active draft exists", { sid, draftLen: activeDraft.length });
        }
        return;
      }
      try {
        const res = await fetch(`${serverUrl}/api/sessions/${encodeURIComponent(sid)}/messages`);
        if (!res.ok) return;
        const data = await res.json();
        const loadedMessages = Array.isArray(data?.messages) ? (data.messages as Message[]) : [];
        const state = getOrCreateSessionState(sid);
        const deduped = deduplicateMessageIds(loadedMessages);
        const maxN = getMaxMessageId(deduped);

        nextIdRef.current = Math.max(nextIdRef.current, maxN);
        setSessionMessages(sid, deduped);
        setSessionDraft(sid, "");
        state.sessionState = "idle";
        setSessionState(state.sessionState);

        if (displayedSessionIdRef.current === sid) {
          setLiveSessionMessages([...deduped]);
          liveMessagesRef.current = deduped;
          setSessionStateForSession(sid, "idle");
          setWaitingForUserInput(false);
          outputBufferRef.current = "";
        }
      } catch (err) {
        if (__DEV__) {
          console.warn("[sse] refresh session from disk failed", { sessionId: sid, error: String(err) });
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

  useEffect(() => {
    const targetSessionId = storeSessionId;
    const targetSessionIntent = getConnectionIntent(targetSessionId);
    const targetSessionRunning = targetSessionId
      ? (targetSessionIntent ?? isTargetSessionRunning)
      : false;
    const prevSessionRuntime = selectedSessionRuntimeRef.current;
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

    if (activeSseRef.current && activeSseRef.current.id !== targetSessionId) {
      if (suppressActiveSessionSwitchRef.current) {
        suppressActiveSessionSwitchRef.current = false;
      } else {
        closeActiveSse("session-switch");
      }
    }

    if (activeSseRef.current) {
      if (activeSseRef.current.id === targetSessionId) {
        setConnected(true);
      }
      return;
    }

    if (__DEV__) console.log("[sse] effect mount", { serverUrl, sessionId: targetSessionId });

    const sid = targetSessionId;
    const connectionSessionIdRef = { current: sid };

    const handlers = createSessionMessageHandlers({
      sidRef: connectionSessionIdRef,
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
    /** Guards against double finalization: set when handleStreamEnd finalizes,
     *  checked in effect cleanup to skip redundant finalize. */
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

    const { url: streamUrl, applySkipReplay } = resolveStreamUrl(serverUrl, sid, skipReplayForSessionRef.current);
    if (applySkipReplay) {
      skipReplayForSessionRef.current = null;
    }
    const sse = new (resolveEventSourceCtor())(streamUrl);
    // Mutable ref so that scheduleRetry always cleans up the *current* SSE,
    // not the original one captured by closure (fixes zombie connection bug).
    const currentSseRef = { current: sse };
    activeSseRef.current = { id: sid, source: sse };

    const setSessionIdWithRekey = (newId: string | null) => {
      const currentSid = connectionSessionIdRef.current;
      if (newId && newId !== currentSid && !newId.startsWith("temp-")) {
        moveSessionCacheData(currentSid, newId, sessionStatesRef.current, sessionMessagesRef.current, sessionDraftRef.current);
        connectionSessionIdRef.current = newId;
        // Sync displayed session ID so live messages continue to display
        // during the rekey window (temp-* → real session ID)
        if (displayedSessionIdRef.current === currentSid) {
          displayedSessionIdRef.current = newId;
        }
        if (activeSseRef.current && activeSseRef.current.id === currentSid) {
          activeSseRef.current.id = newId;
          suppressActiveSessionSwitchRef.current = true;
        }
        const selectedSessionRuntime = selectedSessionRuntimeRef.current;
        if (selectedSessionRuntime?.id === currentSid) {
          selectedSessionRuntimeRef.current = {
            ...selectedSessionRuntime,
            id: newId,
          };
        }
        const intent = connectionIntentBySessionRef.current.get(currentSid);
        if (intent !== undefined) {
          connectionIntentBySessionRef.current.delete(currentSid);
          connectionIntentBySessionRef.current.set(newId, intent);
        }
      }
      setSessionId(newId);
    };

    let pendingAssistantText = "";
    const flushAssistantText = () => {
      if (!pendingAssistantText) return;
      const chunk = pendingAssistantText;
      pendingAssistantText = "";

      if (__DEV__) {
        const perf = streamFlushPerfRef.current;
        perf.flushCount += 1;
        perf.totalChars += chunk.length;
        const now = Date.now();
        const sinceLast = perf.lastFlushAt ? now - perf.lastFlushAt : 0;
        perf.lastFlushAt = now;
        const start = now;
        handlers.appendAssistantTextForSession(chunk);
        if (perf.flushCount % 15 === 0) {
          console.debug("[stream] assistant flush", {
            flushCount: perf.flushCount,
            totalChars: perf.totalChars,
            sinceLastMs: sinceLast,
            appendMs: Date.now() - start,
            chunkLen: chunk.length,
          });
        }
        return;
      }

      handlers.appendAssistantTextForSession(chunk);
    };
    const queueAssistantText = (chunk: string) => {
      pendingAssistantText += chunk;
      if (STREAM_BOUNDARY_MARKER.test(chunk)) {
        if (streamFlushTimeoutRef.current) {
          clearTimeout(streamFlushTimeoutRef.current);
          streamFlushTimeoutRef.current = null;
        }
        flushAssistantText();
        return;
      }
      if (streamFlushTimeoutRef.current) return;
      const currentDraft = getSessionDraft(connectionSessionIdRef.current);
      const delay =
        currentDraft.length + pendingAssistantText.length > STREAM_FLUSH_DRAFT_THRESHOLD
          ? STREAM_FLUSH_INTERVAL_LARGE_MS
          : STREAM_FLUSH_INTERVAL_MS;
      streamFlushTimeoutRef.current = setTimeout(() => {
        streamFlushTimeoutRef.current = null;
        flushAssistantText();
      }, delay);
    };

    const dispatchProviderEvent = createEventDispatcher({
      setPermissionDenials: (d) => setPermissionDenials(d ? deduplicateDenialsRef.current(d) : null),
      setWaitingForUserInput: (v) => {
        if (displayedSessionIdRef.current === connectionSessionIdRef.current) {
          if (!sawAgentEndRef.current) {
            setSessionStateForSession(connectionSessionIdRef.current, "running");
          }
          setWaitingForUserInput(v);
        }
      },
      setPendingAskQuestion,
      setCurrentActivity: () => { /* not surfaced in mobile UI */ },
      setModelName: () => { /* not surfaced in mobile UI */ },
      addMessage: (role, content, codeRefs) => handlers.addMessageForSession(role, content, codeRefs),
      appendAssistantText: (chunk) => queueAssistantText(chunk),
      getCurrentAssistantContent: () => {
        // Include unflushed pendingAssistantText so callers (appendSnapshotTextDelta,
        // appendOverlapTextDelta, result handler) see the true real-time content,
        // not a stale snapshot missing text buffered between flush intervals.
        const draft = getSessionDraft(connectionSessionIdRef.current);
        return pendingAssistantText ? draft + pendingAssistantText : draft;
      },
      getLastMessageRole: () => {
        const m = getOrCreateSessionMessages(connectionSessionIdRef.current);
        return m.length ? m[m.length - 1]?.role ?? null : null;
      },
      getLastMessageContent: () => {
        const m = getOrCreateSessionMessages(connectionSessionIdRef.current);
        const last = m.length ? m[m.length - 1] : null;
        return (last?.content as string) ?? "";
      },
      deduplicateDenials: (d) => deduplicateDenialsRef.current(d),
      recordToolUse: (id, data) => recordToolUseRef.current(id, data),
      getAndClearToolUse: (id) => getAndClearToolUseRef.current(id),
      addPermissionDenial: (denial) => addPermissionDenialRef.current(denial),
      setSessionId: setSessionIdWithRekey,
    });

    /** Snapshot of message count when SSE opens. If unchanged at stream end,
     *  no new content was produced during this connection → refresh from disk. */
    let messageCountAtSseOpen = 0;

    const openHandler = () => {
      hasStreamEndedRef.current = false;
      const sid = connectionSessionIdRef.current;
      messageCountAtSseOpen = sid ? getOrCreateSessionMessages(sid).length : 0;
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
      const delay = Math.min(SSE_RETRY_BASE_MS * Math.pow(2, retryCountRef.current), 30_000);
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
        // Close the *current* SSE source before reconnecting (via mutable ref
        // so retries after retry #1 don't reference the original dead instance).
        try {
          const staleSse = currentSseRef.current;
          staleSse.removeEventListener("open", openHandler);
          staleSse.removeEventListener("error", errorHandler);
          staleSse.removeEventListener("message", messageHandler);
          // @ts-ignore
          staleSse.removeEventListener("end", endHandler);
          // @ts-ignore
          staleSse.removeEventListener("done", doneHandler);
          staleSse.close();
        } catch {}

        const { url: retryUrl } = resolveStreamUrl(serverUrl, connectionSessionIdRef.current, null);
        const retrySse = new (resolveEventSourceCtor())(retryUrl);
        currentSseRef.current = retrySse;
        activeSseRef.current = { id: connectionSessionIdRef.current, source: retrySse };

        retrySse.addEventListener("open", openHandler);
        retrySse.addEventListener("error", errorHandler);
        retrySse.addEventListener("message", messageHandler);
        // @ts-ignore
        retrySse.addEventListener("end", endHandler);
        // @ts-ignore
        retrySse.addEventListener("done", doneHandler);

        activeSseHandlersRef.current = {
          open: openHandler,
          error: errorHandler,
          message: messageHandler,
          end: endHandler,
          done: doneHandler,
        };
      }, delay);
    };

    const errorHandler = (err: unknown) => {
      const e = err as { xhrStatus?: number; xhrState?: number; message?: string };
      const isExpectedServerClose =
        e?.xhrStatus === 200 &&
        e?.xhrState === 4 &&
        (typeof e?.message === "string" && e.message.toLowerCase().includes("connection abort"));
      if (isExpectedServerClose) {
        if (__DEV__) console.log("[sse] stream ended (server closed)", { sessionId: connectionSessionIdRef.current });
        handleStreamEnd({}, 0);
        return;
      }
      if (__DEV__) console.log("[sse] disconnected (error), will retry", { sessionId: connectionSessionIdRef.current, err });
      scheduleRetry();
    };

    const messageHandler = (event: any) => {
      // Accept any string (including empty ""), reject null/undefined.
      if (event.data == null) return;

      const dataStr = event.data;
      const dataStrLen = typeof dataStr === "string" ? dataStr.length : 0;

      // Safety valve: if buffer + new data would exceed limit, reset buffer.
      // This prevents the RangeError from occurring in the first place.
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

        const clean = stripAnsi(trimmed);
        if (!clean) continue;

        if (isProviderSystemNoise(clean)) continue;

        try {
          const parsed = JSON.parse(clean);

          if (parsed.type === "session-started") {
            if (__DEV__) console.log("[sse][DIAG] session-started matched", { displayedSid: displayedSessionIdRef.current, connSid: connectionSessionIdRef.current });
            hasStreamEndedRef.current = false;
            setLastSessionTerminated(false);
            if (displayedSessionIdRef.current === connectionSessionIdRef.current) {
              setSessionStateForSession(connectionSessionIdRef.current, "running");
              setWaitingForUserInput(false);
              setLastSessionTerminated(false);
            }
            const raw = parsed.session_id ?? parsed.sessionId;
            const id = raw != null && raw !== "" ? String(raw) : null;
            if (id && !id.startsWith("temp-")) {
              setSessionIdWithRekey(id);
            }
            lastRunOptionsRef.current = {
              permissionMode: (parsed.permissionMode as string | null) ?? null,
              allowedTools: (Array.isArray(parsed.allowedTools) ? parsed.allowedTools : []) as string[],
              useContinue: Boolean(parsed.useContinue),
            };
            continue;
          }

          if (parsed.type === "session" && typeof parsed.id === "string" && !parsed.id.startsWith("temp-")) {
            if (__DEV__) console.log("[sse][DIAG] session rekey", { from: connectionSessionIdRef.current, to: parsed.id });
            setSessionIdWithRekey(parsed.id);
            continue;
          }

          if (parsed.type === "agent_end") {
            if (__DEV__) {
              console.log("[stream] agent_end event received");
            }
            markAgentEnd();
          }

          if (isProviderStream(parsed)) {
            try {
              dispatchProviderEvent(parsed as Record<string, unknown>);
            } catch (dispatchErr) {
              console.error("[sse][DIAG] RangeError in dispatchProviderEvent", {
                type: parsed.type,
                dataLen: clean.length,
                error: String(dispatchErr),
              });
            }
          } else if (typeof parsed === "object" && parsed != null && "type" in parsed) {
            if (__DEV__) console.log("[sse][DIAG] typed event skipped (not provider stream)", { type: (parsed as Record<string, unknown>).type });
            continue;
          } else {
            try {
              queueAssistantText(clean + "\n");
            } catch (queueErr) {
              console.error("[sse][DIAG] RangeError in queueAssistantText (non-provider)", {
                cleanLen: clean.length,
                pendingLen: pendingAssistantText.length,
                error: String(queueErr),
              });
            }
          }
        } catch (outerErr) {
          // Check if this is a RangeError rather than a JSON parse error
          if (outerErr instanceof RangeError) {
            console.error("[sse][DIAG] RangeError in messageHandler processing", {
              cleanLen: clean.length,
              error: String(outerErr),
            });
            continue;
          }
          const jsonStart = clean.indexOf("{");
          if (clean.startsWith("<u") && jsonStart > 0) {
            try {
              const parsed = JSON.parse(clean.slice(jsonStart));
              if (parsed?.type === "agent_end") {
                markAgentEnd();
              }
              if (isProviderStream(parsed)) {
                dispatchProviderEvent(parsed as Record<string, unknown>);
                continue;
              }
              if (typeof parsed === "object" && parsed != null && "type" in parsed) continue;
            } catch {}
          }
          try {
            queueAssistantText(clean + "\n");
          } catch (queueErr2) {
            console.error("[sse][DIAG] RangeError in queueAssistantText (fallback)", {
              cleanLen: clean.length,
              pendingLen: pendingAssistantText.length,
              error: String(queueErr2),
            });
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
      } catch (e) {}

      if (displayedSessionIdRef.current === connectionSessionIdRef.current) {
        setLastSessionTerminated(exitCode !== 0);
        setSessionStateForSession(connectionSessionIdRef.current, "idle");
        setWaitingForUserInput(false);
      }

      // Flush any remaining partial line left in the output buffer.
      // Without this, the last chunk of AI text is silently discarded
      // when the final SSE payload doesn't end with a newline.
      const remainingBuffer = outputBufferRef.current.trim();
      if (remainingBuffer) {
        outputBufferRef.current = "";
        const clean = stripAnsi(remainingBuffer);
        if (clean && !isProviderSystemNoise(clean)) {
          try {
            const parsed = JSON.parse(clean);
            if (isProviderStream(parsed)) {
              dispatchProviderEvent(parsed as Record<string, unknown>);
            } else if (typeof parsed === "object" && parsed != null && "type" in parsed) {
              // Known typed event but not a provider stream — skip
            } else {
              queueAssistantText(clean + "\n");
            }
          } catch {
            queueAssistantText(clean + "\n");
          }
        }
      }

      if (streamFlushTimeoutRef.current) {
        clearTimeout(streamFlushTimeoutRef.current);
        streamFlushTimeoutRef.current = null;
      }
      flushAssistantText();
      hasFinalizedRef.current = true;
      handlers.finalizeAssistantMessageForSession();
      closeActiveSse("stream-end");

      // If no new messages were produced and no draft is pending during this SSE
      // connection (e.g. reconnecting after a server restart where the replayed
      // JSONL events don't produce real content), refresh from disk so the UI
      // picks up any messages completed since the last REST load.
      const endedSid = connectionSessionIdRef.current;
      if (endedSid && exitCode === 0) {
        const currentMessages = getOrCreateSessionMessages(endedSid);
        const currentDraft = getSessionDraft(endedSid);
        const hasNewContent = currentMessages.length > messageCountAtSseOpen || (currentDraft && currentDraft.length > 0);
        if (!hasNewContent) {
          void refreshCurrentSessionFromDisk(endedSid);
        }
      }
    };

    const endHandler = (event: any) => handleStreamEnd(event, 0);
    const doneHandler = (event: any) => handleStreamEnd(event ?? {}, 0);

    activeSseHandlersRef.current = {
      open: openHandler,
      error: errorHandler,
      message: messageHandler,
      end: endHandler,
      done: doneHandler,
    };

    sse.addEventListener("open", openHandler);
    sse.addEventListener("error", errorHandler);
    sse.addEventListener("message", messageHandler);
    // @ts-ignore - custom event type sent by our backend on terminate/agent_end
    sse.addEventListener("end", endHandler);
    // @ts-ignore - react-native-sse fires "done" when server closes connection
    sse.addEventListener("done", doneHandler);

    return () => {
      isAborted = true;
      clearRetryTimeout();
      // Flush any pending assistant text before the closure is abandoned.
      // Without this, text queued via queueAssistantText() but not yet
      // flushed (waiting on the 50–95ms timer) would be silently lost
      // when the effect re-runs (e.g. polling detects session ended →
      // isTargetSessionRunning flips → closeActiveSse clears the timer).
      if (streamFlushTimeoutRef.current) {
        clearTimeout(streamFlushTimeoutRef.current);
        streamFlushTimeoutRef.current = null;
      }
      flushAssistantText();
      // Only finalize if handleStreamEnd hasn't already done so.
      // Without this guard, the effect cleanup runs a second finalize
      // (triggered by the state change from the first finalize) which
      // sees an empty draft and can clear the completed message.
      if (!hasFinalizedRef.current) {
        handlers.finalizeAssistantMessageForSession();
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
    activeSseRef,
    suppressActiveSessionSwitchRef,
    selectedSessionRuntimeRef,
    setConnected,
    getOrCreateSessionMessages,
    setSessionMessages,
    getSessionDraft,
    setSessionDraft,
    displayedSessionIdRef,
    setLiveSessionMessages,
    liveMessagesRef,
    nextIdRef,
    sawAgentEndRef,
    setWaitingForUserInput,
    skipReplayForSessionRef,
    sessionStatesRef,
    sessionMessagesRef,
    sessionDraftRef,
    connectionIntentBySessionRef,
    setPermissionDenials,
    deduplicateDenialsRef,
    setPendingAskQuestion,
    recordToolUseRef,
    getAndClearToolUseRef,
    addPermissionDenialRef,
    outputBufferRef,
    setLastSessionTerminated,
    activeSseHandlersRef,
  ]);

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
