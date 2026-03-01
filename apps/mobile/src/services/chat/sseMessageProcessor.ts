/**
 * SSE message processing utilities.
 * Extracted from useChatStreamingLifecycle to improve maintainability.
 */
import type { MutableRefObject } from "react";
import type { SseMessageEvent, SessionRuntimeState } from "./hooksTypes";
import type { StreamFlusher } from "./streamFlusher";
import { processRawSseLine, type SseAction } from "./sseMessageParser";
import type { LastRunOptions, PermissionDenial } from "@/core/types";

/** Safety limit for outputBufferRef to prevent RangeError from unbounded string growth. */
export const OUTPUT_BUFFER_MAX_SIZE = 5 * 1024 * 1024;

export interface MessageProcessorContext {
  connectionSessionIdRef: { current: string };
  displayedSessionIdRef: MutableRefObject<string | null>;
  outputBufferRef: MutableRefObject<string>;
  sawAgentEndRef: MutableRefObject<boolean>;
  lastRunOptionsRef: MutableRefObject<LastRunOptions>;
  flusher: StreamFlusher;
  dispatchProviderEvent: (data: Record<string, unknown>) => void;
  setSessionIdWithRekey: (newId: string | null) => void;
  setSessionStateForSession: (sessionId: string | null, next: SessionRuntimeState) => void;
  setWaitingForUserInput: (waiting: boolean) => void;
  setLastSessionTerminated: (terminated: boolean) => void;
  markAgentEnd: () => void;
}

/**
 * Process a single SSE action and dispatch appropriate side effects.
 */
export function processAction(
  action: SseAction,
  ctx: MessageProcessorContext
): void {
  const {
    connectionSessionIdRef,
    displayedSessionIdRef,
    sawAgentEndRef,
    lastRunOptionsRef,
    flusher,
    dispatchProviderEvent,
    setSessionIdWithRekey,
    setSessionStateForSession,
    setWaitingForUserInput,
    setLastSessionTerminated,
    markAgentEnd,
  } = ctx;

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

/**
 * Process incoming SSE message data.
 * Handles buffer management, line splitting, and action dispatching.
 */
export function processSseMessage(
  event: SseMessageEvent,
  ctx: MessageProcessorContext
): void {
  if (event.data == null) return;

  const dataStr = event.data;
  const dataStrLen = typeof dataStr === "string" ? dataStr.length : 0;

  // Safety valve: prevent RangeError from unbounded buffer growth.
  if (ctx.outputBufferRef.current.length + dataStrLen + 1 > OUTPUT_BUFFER_MAX_SIZE) {
    console.warn("[sse] outputBuffer exceeded safety limit, resetting", {
      bufferLen: ctx.outputBufferRef.current.length,
      dataStrLen,
      limit: OUTPUT_BUFFER_MAX_SIZE,
    });
    ctx.outputBufferRef.current = "";
    return;
  }

  ctx.outputBufferRef.current += dataStr + "\n";

  let lines: string[];
  try {
    lines = ctx.outputBufferRef.current.split("\n");
    ctx.outputBufferRef.current = lines.pop() ?? "";
  } catch (splitErr) {
    console.error("[sse][DIAG] RangeError on buffer split", {
      bufferLen: ctx.outputBufferRef.current.length,
      error: String(splitErr),
    });
    ctx.outputBufferRef.current = "";
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
      processAction(action, ctx);
    }
  }
}

/**
 * Resolve the SSE stream URL for a session.
 */
export function resolveStreamUrl(
  serverUrl: string,
  sessionId: string,
  skipReplayForSession: string | null
): { url: string; applySkipReplay: boolean } {
  const baseUrl = `${serverUrl}/api/sessions/${sessionId}/stream?activeOnly=1`;
  const applySkipReplay = skipReplayForSession === sessionId;
  return {
    url: applySkipReplay ? `${baseUrl}&skipReplay=1` : baseUrl,
    applySkipReplay,
  };
}
