/**
 * Fetch-based SSE client using POST.
 * Used for Cloudflare Quick Tunnel, which buffers GET-based SSE until connection close.
 * POST-based SSE streams correctly through the tunnel.
 *
 * Implements EventSourceLike so it can be used as a drop-in replacement.
 */
import type { EventSourceLike, SseMessageEvent } from "./hooksTypes";

export type FetchSseOptions = {
  url: string;
  body: { activeOnly?: boolean; skipReplay?: boolean };
  signal?: AbortSignal | undefined;
};

type Listener = (...args: unknown[]) => void;

export function createFetchSseClient(options: FetchSseOptions): EventSourceLike {
  const { url, body, signal } = options;
  const listeners: Record<string, Listener[]> = { open: [], error: [], message: [], end: [], done: [] };
  let closed = false;
  let aborted = false;

  function addEventListener(event: string, handler: (...args: unknown[]) => void) {
    const list = listeners[event as keyof typeof listeners];
    if (list && !list.includes(handler)) list.push(handler);
  }

  function removeEventListener(event: string, handler: (...args: unknown[]) => void) {
    const list = listeners[event as keyof typeof listeners];
    if (list) {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    }
  }

  function emit(event: string, ...args: unknown[]) {
    const list = listeners[event as keyof typeof listeners];
    if (list) list.forEach((h) => h(...args));
  }

  function close() {
    if (closed) return;
    closed = true;
    aborted = true;
  }

  const controller = new AbortController();
  const effectiveSignal = signal || controller.signal;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: effectiveSignal,
    // @ts-ignore - React Native option to enable streaming
    reactNative: { textStreaming: true },
  })
    .then(async (response) => {
      if (closed || aborted) return;
      // #region agent log
      console.log("[DBG-099c89] fetch SSE response", { ok: response.ok, status: response.status, hasBody: !!response.body });
      // #endregion
      if (!response.ok) {
        emit("error", { status: response.status, statusText: response.statusText });
        return;
      }
      emit("open");

      const reader = response.body?.getReader();
      // #region agent log
      console.log("[DBG-099c89] fetch SSE reader", { hasReader: !!reader });
      // #endregion
      if (!reader) {
        emit("error", new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let readCount = 0;

      try {
        while (true) {
          if (closed || aborted) break;
          const { value, done } = await reader.read();
          if (done) break;
          readCount++;
          const decoded = decoder.decode(value, { stream: true });
          // #region agent log
          if (readCount <= 5 || readCount % 20 === 0) { console.log("[DBG-099c89] fetch SSE read", { readNum: readCount, chunkLen: decoded.length, ts: Date.now() }); }
          // #endregion
          buffer += decoded;

          // Parse SSE: events are separated by double newline
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;
            let eventType = "message";
            const dataLines: string[] = [];

            for (const line of part.split("\n")) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
              }
            }

            const data = dataLines.length > 0 ? dataLines.join("\n") : null;
            if (data != null) {
              const msgEvent: SseMessageEvent = { data, type: eventType };
              if (eventType === "end") {
                emit("end", msgEvent);
              } else {
                emit("message", msgEvent);
              }
            }
          }
        }
      } catch (err) {
        if (!aborted && !closed) {
          emit("error", err);
        }
      } finally {
        if (!closed) emit("done", { data: "{}" });
      }
    })
    .catch((err) => {
      if (!aborted && !closed) {
        emit("error", err);
      }
    });

  return {
    addEventListener,
    removeEventListener,
    close: () => {
      close();
      controller.abort();
    },
  };
}
