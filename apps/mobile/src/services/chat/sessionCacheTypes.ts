/**
 * Unified session cache types.
 * Consolidates session state, messages, draft, and tool use into a single structure.
 */
import type { Message } from "@/core/types";
import type { SessionRuntimeState } from "./hooksTypes";

export type SessionToolUse = {
  tool_name: string;
  tool_input?: Record<string, unknown>;
};

export interface SessionCacheEntry {
  /** Runtime state of the session (idle/running). */
  state: SessionRuntimeState;
  /** Messages in this session. */
  messages: Message[];
  /** Current assistant draft (streaming content). */
  draft: string;
  /** Tool use data by ID. */
  toolUse: Map<string, SessionToolUse>;
}

/**
 * Create a new empty session cache entry.
 */
export function createSessionCacheEntry(): SessionCacheEntry {
  return {
    state: "idle",
    messages: [],
    draft: "",
    toolUse: new Map(),
  };
}
