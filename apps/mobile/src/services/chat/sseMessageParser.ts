/**
 * SSE message line parser.
 *
 * Handles the per-line parsing logic inside the SSE messageHandler:
 *  - ANSI stripping and system-noise filtering
 *  - JSON parsing with a `<u …>` prefix fallback (PTY artifact)
 *  - Routing to provider-stream dispatcher vs plain text queue
 *
 * Keeping this pure (no React, no refs) makes it easy to unit-test edge cases
 * (RangeError, malformed JSON, prefixed JSON, etc.) without a hook harness.
 */
import { isProviderStream, isProviderSystemNoise, stripAnsi } from "@/services/providers/stream";

export type SseAction =
  | { kind: "skip" }
  | { kind: "providerEvent"; data: Record<string, unknown> }
  | { kind: "agentEnd" }
  | { kind: "sessionStarted"; sessionId: string | null; permissionMode: string | null; allowedTools: string[]; useContinue: boolean }
  | { kind: "sessionRekey"; sessionId: string }
  | { kind: "assistantText"; text: string };

/**
 * Parse a single raw SSE line from the output buffer.
 * Returns a discriminated union describing what action the caller should take.
 */
function parseSseLine(clean: string): SseAction | SseAction[] {
  try {
    const parsed = JSON.parse(clean);

    if (parsed.type === "session-started") {
      const sessionIdRaw = parsed.session_id ?? parsed.sessionId;
      const sessionId = sessionIdRaw != null && sessionIdRaw !== "" ? String(sessionIdRaw) : null;
      return {
        kind: "sessionStarted",
        sessionId: sessionId && !sessionId.startsWith("temp-") ? sessionId : null,
        permissionMode: (parsed.permissionMode as string | null) ?? null,
        allowedTools: (Array.isArray(parsed.allowedTools) ? parsed.allowedTools : []) as string[],
        useContinue: Boolean(parsed.useContinue),
      };
    }

    if (parsed.type === "session" && typeof parsed.id === "string" && !parsed.id.startsWith("temp-")) {
      return { kind: "sessionRekey", sessionId: parsed.id };
    }

    const actions: SseAction[] = [];

    if (parsed.type === "agent_end") {
      actions.push({ kind: "agentEnd" });
    }

    if (isProviderStream(parsed)) {
      actions.push({ kind: "providerEvent", data: parsed as Record<string, unknown> });
    } else if (typeof parsed === "object" && parsed != null && "type" in parsed) {
      // Known typed event but not a provider stream — skip
      actions.push({ kind: "skip" });
    } else {
      actions.push({ kind: "assistantText", text: clean + "\n" });
    }

    return actions.length === 1 ? actions[0] : actions;
  } catch (error) {
    if (error instanceof RangeError) {
      return { kind: "skip" };
    }

    // PTY prefix fallback: some lines arrive as `<u 'command' u>{...json...}`
    const jsonStart = clean.indexOf("{");
    if (clean.startsWith("<u") && jsonStart > 0) {
      try {
        const parsed = JSON.parse(clean.slice(jsonStart));
        const actions: SseAction[] = [];
        if (parsed?.type === "agent_end") actions.push({ kind: "agentEnd" });
        if (isProviderStream(parsed)) {
          actions.push({ kind: "providerEvent", data: parsed as Record<string, unknown> });
          return actions.length === 1 ? actions[0] : actions;
        }
        if (typeof parsed === "object" && parsed != null && "type" in parsed) {
          return { kind: "skip" };
        }
      } catch {
        // fall through to assistantText below
      }
    }

    return { kind: "assistantText", text: clean + "\n" };
  }
}

/**
 * Process a raw SSE data payload through the full pipeline:
 *  1. ANSI strip
 *  2. System-noise filter
 *  3. Parse to discriminated action(s)
 *
 * Returns null when the line should be silently discarded.
 */
export function processRawSseLine(raw: string): SseAction | SseAction[] | null {
  const clean = stripAnsi(raw.trim());
  if (!clean) return null;
  if (isProviderSystemNoise(clean)) return null;
  return parseSseLine(clean);
}
