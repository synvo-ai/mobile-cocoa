/**
 * SSE lifecycle management utilities.
 * Handles connection state, retry logic, and stream end processing.
 * Extracted from useChatStreamingLifecycle to improve maintainability.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Message } from "@/core/types";
import type { EventSourceLike, SessionRuntimeState } from "./hooksTypes";
import type { SseEventHandlers } from "./sseConnection";
import type { StreamFlusher } from "./streamFlusher";
import type { SessionMessageHandlers } from "./sessionMessageHandlers";
import { isProviderStream, stripAnsi } from "@/services/providers/stream";
import {
  SSE_MAX_RETRIES,
  attachSseHandlers,
  computeRetryDelay,
  createSseClient,
  detachSseHandlers,
} from "./sseConnection";

export interface SseLifecycleState {
  hasStreamEndedRef: { current: boolean };
  hasFinalizedRef: { current: boolean };
  retryCountRef: { current: number };
  retryTimeoutRef: { current: ReturnType<typeof setTimeout> | null };
  isAborted: boolean;
  messageCountAtSseOpen: number;
}

export interface SseLifecycleContext {
  serverUrl: string;
  connectionSessionIdRef: { current: string };
  displayedSessionIdRef: MutableRefObject<string | null>;
  outputBufferRef: MutableRefObject<string>;
  sawAgentEndRef: MutableRefObject<boolean>;
  activeSseRef: MutableRefObject<{ id: string; source: EventSourceLike } | null>;
  activeSseHandlersRef: MutableRefObject<SseEventHandlers | null>;
  currentSseRef: { current: EventSourceLike };
  flusher: StreamFlusher;
  msgHandlers: SessionMessageHandlers;
  dispatchProviderEvent: (data: Record<string, unknown>) => void;
  getOrCreateSessionMessages: (sessionId: string) => Message[];
  getSessionDraft: (sessionId: string) => string;
  setSessionStateForSession: (sessionId: string | null, next: SessionRuntimeState) => void;
  setWaitingForUserInput: Dispatch<SetStateAction<boolean>>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setLastSessionTerminated: Dispatch<SetStateAction<boolean>>;
  closeActiveSse: (reason?: string) => void;
  refreshCurrentSessionFromDisk: (sessionId: string | null) => Promise<void>;
}

/**
 * Create the open event handler.
 */
export function createOpenHandler(
  state: SseLifecycleState,
  ctx: SseLifecycleContext,
  clearRetryTimeout: () => void
): () => void {
  return () => {
    state.hasStreamEndedRef.current = false;
    const currentSessionId = ctx.connectionSessionIdRef.current;
    state.messageCountAtSseOpen = currentSessionId ? ctx.getOrCreateSessionMessages(currentSessionId).length : 0;
    state.retryCountRef.current = 0;
    clearRetryTimeout();
    if (__DEV__) console.log("[sse] connected", { sessionId: ctx.connectionSessionIdRef.current });
    ctx.setConnected(true);
  };
}

/**
 * Create the retry scheduler.
 */
export function createRetryScheduler(
  state: SseLifecycleState,
  ctx: SseLifecycleContext,
  sseHandlers: SseEventHandlers
): () => void {
  return () => {
    if (state.isAborted) return;
    if (state.retryCountRef.current >= SSE_MAX_RETRIES) {
      if (__DEV__) console.log("[sse] max retries reached, giving up", { sessionId: ctx.connectionSessionIdRef.current });
      if (ctx.displayedSessionIdRef.current === ctx.connectionSessionIdRef.current) {
        ctx.setConnected(false);
      }
      return;
    }
    const delay = computeRetryDelay(state.retryCountRef.current);
    state.retryCountRef.current += 1;
    if (__DEV__)
      console.log("[sse] scheduling retry", {
        attempt: state.retryCountRef.current,
        delayMs: delay,
        sessionId: ctx.connectionSessionIdRef.current,
      });

    state.retryTimeoutRef.current = setTimeout(() => {
      state.retryTimeoutRef.current = null;
      if (state.isAborted) return;

      detachSseHandlers(ctx.currentSseRef.current, sseHandlers);
      ctx.currentSseRef.current.close();

      const { source: retrySse } = createSseClient(
        ctx.serverUrl,
        ctx.connectionSessionIdRef.current,
        ctx.connectionSessionIdRef.current
      );
      ctx.currentSseRef.current = retrySse;
      ctx.activeSseRef.current = { id: ctx.connectionSessionIdRef.current, source: retrySse };

      attachSseHandlers(retrySse, sseHandlers);
      ctx.activeSseHandlersRef.current = sseHandlers;
    }, delay);
  };
}

/**
 * Create the error event handler.
 */
export function createErrorHandler(
  scheduleRetry: () => void,
  handleStreamEnd: (event: { data?: string }, exitCode: number) => void
): (err: unknown) => void {
  return (err: unknown) => {
    const eventError = err as { xhrStatus?: number; xhrState?: number; message?: string };
    const isExpectedServerClose =
      eventError?.xhrStatus === 200 &&
      eventError?.xhrState === 4 &&
      (typeof eventError?.message === "string" && eventError.message.toLowerCase().includes("connection abort"));
    if (isExpectedServerClose) {
      if (__DEV__) console.log("[sse] stream ended (server closed)");
      handleStreamEnd({}, 0);
      return;
    }
    if (__DEV__) console.log("[sse] disconnected (error), will retry", { err });
    scheduleRetry();
  };
}

/**
 * Create the stream end handler.
 */
export function createStreamEndHandler(
  state: SseLifecycleState,
  ctx: SseLifecycleContext
): (event: { data?: string }, exitCodeDefault?: number) => void {
  return (event: { data?: string }, exitCodeDefault = 0) => {
    if (state.hasStreamEndedRef.current) return;
    state.hasStreamEndedRef.current = true;

    let exitCode = exitCodeDefault;
    try {
      if (event?.data) {
        const parsed = JSON.parse(event.data);
        exitCode = parsed.exitCode ?? exitCodeDefault;
      }
    } catch {}

    if (ctx.displayedSessionIdRef.current === ctx.connectionSessionIdRef.current) {
      ctx.setLastSessionTerminated(exitCode !== 0);
      ctx.setSessionStateForSession(ctx.connectionSessionIdRef.current, "idle");
      ctx.setWaitingForUserInput(false);
    }

    // Flush any remaining partial line in the output buffer.
    const remainingBuffer = ctx.outputBufferRef.current.trim();
    if (remainingBuffer) {
      ctx.outputBufferRef.current = "";
      const clean = stripAnsi(remainingBuffer);
      if (clean) {
        try {
          const parsed = JSON.parse(clean);
          if (isProviderStream(parsed)) {
            ctx.dispatchProviderEvent(parsed as Record<string, unknown>);
          } else if (typeof parsed === "object" && parsed != null && "type" in parsed) {
            // Known typed event but not a provider stream — skip
          } else {
            ctx.flusher.queue(clean + "\n");
          }
        } catch {
          ctx.flusher.queue(clean + "\n");
        }
      }
    }

    ctx.flusher.cancel();
    ctx.flusher.flush();
    state.hasFinalizedRef.current = true;
    ctx.msgHandlers.finalizeAssistantMessageForSession();
    ctx.closeActiveSse("stream-end");

    // Refresh from disk if no new content was produced.
    const endedSessionId = ctx.connectionSessionIdRef.current;
    if (endedSessionId && exitCode === 0) {
      const currentMessages = ctx.getOrCreateSessionMessages(endedSessionId);
      const currentDraft = ctx.getSessionDraft(endedSessionId);
      const hasNewContent = currentMessages.length > state.messageCountAtSseOpen || (currentDraft && currentDraft.length > 0);
      if (!hasNewContent) {
        void ctx.refreshCurrentSessionFromDisk(endedSessionId);
      }
    }
  };
}

/**
 * Clear the retry timeout.
 */
export function createClearRetryTimeout(state: SseLifecycleState): () => void {
  return () => {
    if (state.retryTimeoutRef.current !== null) {
      clearTimeout(state.retryTimeoutRef.current);
      state.retryTimeoutRef.current = null;
    }
  };
}

/**
 * Create the mark agent end helper.
 */
export function createMarkAgentEnd(
  ctx: Pick<SseLifecycleContext, "sawAgentEndRef" | "connectionSessionIdRef" | "displayedSessionIdRef" | "setSessionStateForSession" | "setWaitingForUserInput">
): () => void {
  return () => {
    if (ctx.sawAgentEndRef.current) return;
    ctx.sawAgentEndRef.current = true;
    const endedSessionId = ctx.connectionSessionIdRef.current;
    if (!endedSessionId) return;
    if (ctx.displayedSessionIdRef.current === endedSessionId) {
      ctx.setSessionStateForSession(endedSessionId, "idle");
      ctx.setWaitingForUserInput(false);
    }
  };
}
