/**
 * Stream flush utilities for assistant text buffering.
 *
 * Manages the dual-path flushing strategy:
 *  - Immediate flush on sentence-boundary characters (`.`, `!`, `?`, `;`, `,`, `\n`)
 *  - Debounced flush (50–95ms) for mid-word chunks to avoid excessive re-renders
 *
 * Extracted from useChatStreamingLifecycle so the buffering logic can be
 * tested independently and the hook stays focused on React state.
 */

const STREAM_FLUSH_INTERVAL_MS = 50;
const STREAM_FLUSH_INTERVAL_LARGE_MS = 95;
const STREAM_FLUSH_DRAFT_THRESHOLD = 2400;
const STREAM_BOUNDARY_MARKER = /[.!?;,\n]/;

type StreamFlushContext = {
  /** Flush any accumulated text immediately. */
  flush: () => void;
  /** Enqueue a text chunk, flushing immediately on boundary chars or after a short timer. */
  queue: (chunk: string) => void;
  /** Cancel any pending flush timer without flushing. */
  cancel: () => void;
};

/**
 * Create a StreamFlushContext that batches assistant text chunks and flushes
 * them to `onFlush` in debounced bursts.
 *
 * @param onFlush        - Called with the accumulated text when flushed.
 * @param getSessionDraft - Returns the current draft length for adaptive delay.
 * @param timerRef        - Mutable ref for the active setTimeout handle (shared with caller for cleanup).
 * @param onDebugFlush    - Optional __DEV__-only callback for perf logging.
 */
export function createStreamFlusher(
  onFlush: (chunk: string) => void,
  getSessionDraft: () => string,
  timerRef: { current: ReturnType<typeof setTimeout> | null },
  onDebugFlush?: (chunk: string) => void,
): StreamFlushContext {
  let pending = "";

  const flush = (): void => {
    if (!pending) return;
    const chunk = pending;
    pending = "";
    onFlush(chunk);
    if (onDebugFlush) {
      onDebugFlush(chunk);
    }
  };

  const cancel = (): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const queue = (chunk: string): void => {
    pending += chunk;
    if (STREAM_BOUNDARY_MARKER.test(chunk)) {
      cancel();
      flush();
      return;
    }
    if (timerRef.current) return;
    const draft = getSessionDraft();
    const delay =
      draft.length + pending.length > STREAM_FLUSH_DRAFT_THRESHOLD
        ? STREAM_FLUSH_INTERVAL_LARGE_MS
        : STREAM_FLUSH_INTERVAL_MS;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, delay);
  };

  return { flush, queue, cancel };
}
