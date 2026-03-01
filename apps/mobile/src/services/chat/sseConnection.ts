/**
 * SSE connection utilities: EventSource constructor resolution and retry scheduling.
 *
 * Extracted from useChatStreamingLifecycle to keep the hook focused on React state management.
 * These are pure functions / factory helpers with no React dependencies.
 */
import EventSource from "react-native-sse";
import type { EventSourceCtor, EventSourceLike } from "./hooksTypes";

export const SSE_MAX_RETRIES = 5;
const SSE_RETRY_BASE_MS = 1000;

/** Resolve the EventSource constructor across CJS/ESM module shapes. */
export function resolveEventSourceCtor(): EventSourceCtor {
  return ((EventSource as unknown as { default?: EventSourceCtor }).default ??
    (EventSource as EventSourceCtor)) as EventSourceCtor;
}

export type SseEventHandlers = {
  open: (event: unknown) => void;
  error: (event: unknown) => void;
  message: (event: any) => void;
  end: (event: any) => void;
  done: (event: any) => void;
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
