/**
 * SSE connection utilities: EventSource constructor resolution and retry scheduling.
 *
 * Extracted from useChatStreamingLifecycle to keep the hook focused on React state management.
 * These are pure functions / factory helpers with no React dependencies.
 *
 * Uses POST-based SSE when in Cloudflare mode (Quick Tunnel buffers GET-based SSE).
 */
import EventSource from "react-native-sse";
import { isCloudflareMode } from "@/services/server/config";
import type { EventSourceCtor, EventSourceLike, SseMessageEvent } from "./hooksTypes";
import { createFetchSseClient } from "./sseFetchClient";
import { resolveStreamUrl, resolveStreamUrlPost } from "./sseMessageProcessor";

export const SSE_MAX_RETRIES = 5;
const SSE_RETRY_BASE_MS = 1000;

/** Resolve the EventSource constructor across CJS/ESM module shapes. */
export function resolveEventSourceCtor(): EventSourceCtor {
  return ((EventSource as unknown as { default?: EventSourceCtor }).default ??
    (EventSource as EventSourceCtor)) as EventSourceCtor;
}

/**
 * Create an SSE client (EventSource or fetch-based POST).
 * Uses POST when in Cloudflare mode to avoid Quick Tunnel buffering.
 */
export function createSseClient(
  serverUrl: string,
  sessionId: string,
  skipReplayForSession: string | null
): { source: EventSourceLike; applySkipReplay: boolean } {
  const cfMode = isCloudflareMode();
  // #region agent log
  console.log("[DBG-099c89] createSseClient", { cfMode, serverUrl: serverUrl.substring(0, 50) });
  // #endregion
  if (cfMode) {
    const { url, body, applySkipReplay } = resolveStreamUrlPost(serverUrl, sessionId, skipReplayForSession);
    // #region agent log
    console.log("[DBG-099c89] Using POST fetch SSE client", { url: url.substring(0, 80) });
    // #endregion
    return { source: createFetchSseClient({ url, body }), applySkipReplay };
  }
  // #region agent log
  console.log("[DBG-099c89] Using GET EventSource SSE client");
  // #endregion
  const { url, applySkipReplay } = resolveStreamUrl(serverUrl, sessionId, skipReplayForSession);
  const Ctor = resolveEventSourceCtor();
  return { source: new Ctor(url), applySkipReplay };
}

export type SseEventHandlers = {
  open: (event: unknown) => void;
  error: (event: unknown) => void;
  message: (event: SseMessageEvent) => void;
  end: (event: SseMessageEvent) => void;
  done: (event: SseMessageEvent) => void;
};

/** Attach the given handlers to an SSE source. */
export function attachSseHandlers(source: EventSourceLike, handlers: SseEventHandlers): void {
  source.addEventListener("open", handlers.open);
  source.addEventListener("error", handlers.error);
  source.addEventListener("message", handlers.message);
  // @ts-ignore - custom event type sent by our backend on terminate/agent_end
  source.addEventListener("end", handlers.end);
  // @ts-ignore - react-native-sse fires "done" when server closes connection
  source.addEventListener("done", handlers.done);
}

/** Detach the given handlers from an SSE source. */
export function detachSseHandlers(source: EventSourceLike, handlers: SseEventHandlers): void {
  source.removeEventListener("open", handlers.open);
  source.removeEventListener("error", handlers.error);
  source.removeEventListener("message", handlers.message);
  source.removeEventListener("end", handlers.end);
  source.removeEventListener("done", handlers.done);
}

/** Compute exponential backoff delay, capped at 30 seconds. */
export function computeRetryDelay(retryCount: number): number {
  return Math.min(SSE_RETRY_BASE_MS * Math.pow(2, retryCount), 30_000);
}
