/**
 * Shared constants for server-side operations.
 * Consolidates magic numbers to improve maintainability.
 */

/** Byte threshold above which SSE events are stripped to prevent unbounded growth. */
export const SLIM_EVENT_THRESHOLD_BYTES = 2048;

/** Maximum ms to wait for an agent process to start before sending SSE end. */
export const SSE_PROCESS_START_WAIT_MS = 6_000;

/** Interval in ms to poll for process start during active-only SSE connections. */
export const SSE_PROCESS_START_POLL_MS = 150;

/** Current session file format version. */
export const SESSION_FILE_VERSION = 3;
