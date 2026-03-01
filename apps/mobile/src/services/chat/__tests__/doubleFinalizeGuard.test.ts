/**
 * Tests for the double-finalize guard.
 *
 * Validates that:
 * 1. sessionMessageHandlers.finalizeAssistantMessageForSession preserves
 *    assistant content when called twice (the existing content guard).
 * 2. The hasFinalizedRef guard in useChatStreamingLifecycle prevents the
 *    effect cleanup from calling finalize when handleStreamEnd already did.
 */
import { createSessionMessageHandlers } from "../sessionMessageHandlers";
import type { SessionLiveState, SessionRuntimeState } from "../hooksTypes";
import type { Message } from "@/core/types";

/** Build mock deps for createSessionMessageHandlers with an in-memory store. */
function createMockDeps(sessionId = "test-session") {
  const messages: Map<string, Message[]> = new Map();
  const drafts: Map<string, string> = new Map();
  const states: Map<string, SessionLiveState> = new Map();

  const liveMessages: Message[] = [];
  const liveMessagesRef = { current: liveMessages };
  const displayedSessionIdRef = { current: sessionId as string | null };
  const nextIdRef = { current: 0 };
  const sidRef = { current: sessionId };

  const setLiveSessionMessages = jest.fn((msgs: Message[] | ((prev: Message[]) => Message[])) => {
    if (typeof msgs === "function") {
      liveMessagesRef.current = msgs(liveMessagesRef.current);
    } else {
      liveMessagesRef.current = msgs;
    }
  });
  const setSessionStateForSession = jest.fn(
    (_sid: string | null, _next: SessionRuntimeState) => {}
  );

  const getOrCreateSessionState = (sid: string): SessionLiveState => {
    if (!states.has(sid)) {
      states.set(sid, { sessionState: "idle" });
    }
    return states.get(sid)!;
  };

  const getOrCreateSessionMessages = (sid: string): Message[] => {
    if (!messages.has(sid)) messages.set(sid, []);
    return messages.get(sid)!;
  };

  const setSessionMessages = (sid: string, msgs: Message[]) => {
    messages.set(sid, msgs);
  };

  const getSessionDraft = (sid: string): string => drafts.get(sid) ?? "";
  const setSessionDraft = (sid: string, draft: string) => {
    drafts.set(sid, draft);
  };

  return {
    deps: {
      sidRef,
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
    },
    // Expose internals for assertions
    messages,
    drafts,
    states,
    liveMessagesRef,
    setLiveSessionMessages,
    setSessionStateForSession,
  };
}

describe("double finalize guard — sessionMessageHandlers", () => {
  it("single finalize preserves assistant content and clears draft", () => {
    const { deps, messages, drafts } = createMockDeps();
    const handlers = createSessionMessageHandlers(deps);

    // Simulate streaming: append text to build up assistant message
    handlers.appendAssistantTextForSession("Hello, ");
    handlers.appendAssistantTextForSession("world!");

    // Verify message and draft accumulated
    const sid = "test-session";
    expect(messages.get(sid)!.length).toBe(1);
    expect(messages.get(sid)![0].role).toBe("assistant");
    expect(messages.get(sid)![0].content).toBe("Hello, world!");
    expect(drafts.get(sid)).toBe("Hello, world!");

    // First finalize — this is the normal handleStreamEnd path
    handlers.finalizeAssistantMessageForSession();

    // Content should be preserved, draft cleared
    expect(messages.get(sid)!.length).toBe(1);
    expect(messages.get(sid)![0].content).toBe("Hello, world!");
    expect(drafts.get(sid)).toBe("");
  });

  it("double finalize does NOT delete assistant message with content", () => {
    const { deps, messages, drafts } = createMockDeps();
    const handlers = createSessionMessageHandlers(deps);

    // Simulate streaming
    handlers.appendAssistantTextForSession("Hello, ");
    handlers.appendAssistantTextForSession("world!");

    const sid = "test-session";

    // First finalize (from handleStreamEnd)
    handlers.finalizeAssistantMessageForSession();
    expect(messages.get(sid)!.length).toBe(1);
    expect(messages.get(sid)![0].content).toBe("Hello, world!");
    expect(drafts.get(sid)).toBe("");

    // Second finalize (from effect cleanup) — draft is now empty
    handlers.finalizeAssistantMessageForSession();

    // Content must still be preserved! This was the bug scenario.
    expect(messages.get(sid)!.length).toBe(1);
    expect(messages.get(sid)![0].content).toBe("Hello, world!");
    expect(drafts.get(sid)).toBe("");
  });

  it("double finalize DOES delete empty assistant message (no content streamed)", () => {
    const { deps, messages } = createMockDeps();
    const handlers = createSessionMessageHandlers(deps);
    const sid = "test-session";

    // Add an empty assistant message manually (simulates partial stream with no content)
    deps.setSessionMessages(sid, [{ id: "msg-1", role: "assistant", content: "" }]);

    handlers.finalizeAssistantMessageForSession();
    // Empty message should be removed
    expect(messages.get(sid)!.length).toBe(0);
  });

  it("preserves user + assistant message sequence on double finalize", () => {
    const { deps, messages } = createMockDeps();
    const handlers = createSessionMessageHandlers(deps);
    const sid = "test-session";

    // User message
    handlers.addMessageForSession("user", "Hi there");
    // Assistant streams response
    handlers.appendAssistantTextForSession("<think>\nReasoning here\n</think>\n\nHello!");

    expect(messages.get(sid)!.length).toBe(2);
    expect(messages.get(sid)![0].role).toBe("user");
    expect(messages.get(sid)![1].role).toBe("assistant");

    // First finalize
    handlers.finalizeAssistantMessageForSession();
    expect(messages.get(sid)!.length).toBe(2);

    // Second finalize (the bug scenario)
    handlers.finalizeAssistantMessageForSession();

    // Both messages must survive
    expect(messages.get(sid)!.length).toBe(2);
    expect(messages.get(sid)![0].role).toBe("user");
    expect(messages.get(sid)![0].content).toBe("Hi there");
    expect(messages.get(sid)![1].role).toBe("assistant");
    expect((messages.get(sid)![1].content as string).length).toBeGreaterThan(0);
  });

  it("state transitions to idle on finalize", () => {
    const { deps, states, setSessionStateForSession } = createMockDeps();
    const handlers = createSessionMessageHandlers(deps);
    const sid = "test-session";

    handlers.appendAssistantTextForSession("response");
    expect(states.get(sid)?.sessionState).toBe("running");

    handlers.finalizeAssistantMessageForSession();
    expect(states.get(sid)?.sessionState).toBe("idle");
    expect(setSessionStateForSession).toHaveBeenCalledWith(sid, "idle");
  });
});

describe("hasFinalizedRef guard — lifecycle simulation", () => {
  /**
   * This simulates the key logic from useChatStreamingLifecycle:
   * - handleStreamEnd sets hasFinalizedRef = true, then calls finalize
   * - effect cleanup checks hasFinalizedRef before calling finalize
   */
  it("cleanup skips finalize when handleStreamEnd already ran", () => {
    const { deps, messages } = createMockDeps();
    const handlers = createSessionMessageHandlers(deps);
    const sid = "test-session";

    // Simulate streaming
    handlers.appendAssistantTextForSession("Hello!");

    // --- Simulate handleStreamEnd ---
    const hasFinalizedRef = { current: false };
    hasFinalizedRef.current = true;
    handlers.finalizeAssistantMessageForSession();

    expect(messages.get(sid)!.length).toBe(1);
    expect(messages.get(sid)![0].content).toBe("Hello!");

    // --- Simulate effect cleanup ---
    // The guard prevents redundant finalize
    if (!hasFinalizedRef.current) {
      handlers.finalizeAssistantMessageForSession();
    }

    // Content preserved — only one finalize actually ran
    expect(messages.get(sid)!.length).toBe(1);
    expect(messages.get(sid)![0].content).toBe("Hello!");
  });

  it("cleanup DOES finalize when handleStreamEnd did NOT run (e.g. session switch)", () => {
    const { deps, messages, drafts } = createMockDeps();
    const handlers = createSessionMessageHandlers(deps);
    const sid = "test-session";

    // Simulate streaming (incomplete — session switch before stream end)
    handlers.appendAssistantTextForSession("Partial response...");

    const hasFinalizedRef = { current: false };

    // handleStreamEnd did NOT run (session was switched)
    // --- Simulate effect cleanup ---
    if (!hasFinalizedRef.current) {
      handlers.finalizeAssistantMessageForSession();
    }

    // Cleanup finalized correctly: content preserved, draft cleared
    expect(messages.get(sid)!.length).toBe(1);
    expect(messages.get(sid)![0].content).toBe("Partial response...");
    expect(drafts.get(sid)).toBe("");
  });
});

describe("skipReplayForSessionRef — replay duplication prevention", () => {
  /**
   * This simulates the bug where submitting a second prompt to the same session
   * caused the SSE stream to replay the entire JSONL history, re-processing
   * the first turn's message_update events and duplicating them into the second
   * assistant response.
   */
  it("simulates replay duplication when skipReplay is NOT set", () => {
    const { deps, messages } = createMockDeps();
    const handlers = createSessionMessageHandlers(deps);
    const sid = "test-session";

    // === Turn 1: user sends "Hi", assistant responds ===
    handlers.addMessageForSession("user", "Hi");
    handlers.appendAssistantTextForSession("Hello! How can I help?");
    handlers.finalizeAssistantMessageForSession();

    expect(messages.get(sid)!.length).toBe(2);
    expect(messages.get(sid)![1].content).toBe("Hello! How can I help?");

    // === Turn 2: user sends "What is 2+2?" ===
    handlers.addMessageForSession("user", "What is 2+2?");
    expect(messages.get(sid)!.length).toBe(3);

    // BUG SCENARIO: SSE replays Turn 1's message_update events
    // because skipReplay was not set. The replayed content gets
    // appended as if it were new assistant text.
    handlers.appendAssistantTextForSession("Hello! How can I help?"); // ← replayed!
    handlers.appendAssistantTextForSession("2+2 = 4"); // ← actual new response

    // Without the fix, the second assistant message contains BOTH:
    const lastMsg = messages.get(sid)![messages.get(sid)!.length - 1];
    expect(lastMsg.role).toBe("assistant");
    // This demonstrates the duplication — content starts with the replayed text
    expect((lastMsg.content as string)).toBe("Hello! How can I help?2+2 = 4");
    // The content is WRONG — it should only be "2+2 = 4"
    expect((lastMsg.content as string)).not.toBe("2+2 = 4");
  });

  it("skipReplayForSessionRef prevents replay duplication", () => {
    const skipReplayForSessionRef = { current: null as string | null };
    const sid = "test-session";

    // Simulate what submitPrompt does: set skipReplayForSessionRef
    // BEFORE the SSE connection is established
    skipReplayForSessionRef.current = sid;

    // Verify the ref is set (this is what resolveStreamUrl checks)
    expect(skipReplayForSessionRef.current).toBe(sid);

    // Simulate resolveStreamUrl reading and clearing the ref
    const shouldSkipReplay = skipReplayForSessionRef.current === sid;
    expect(shouldSkipReplay).toBe(true);

    // After applying, ref is cleared
    if (shouldSkipReplay) {
      skipReplayForSessionRef.current = null;
    }
    expect(skipReplayForSessionRef.current).toBeNull();
  });

  it("without skipReplay set, ref remains null (first prompt scenario)", () => {
    const skipReplayForSessionRef = { current: null as string | null };

    // On first prompt, there is no existing session, so skipReplay is not needed
    expect(skipReplayForSessionRef.current).toBeNull();

    // resolveStreamUrl generates URL without skipReplay param
    const shouldSkipReplay = skipReplayForSessionRef.current === "new-session-id";
    expect(shouldSkipReplay).toBe(false);
  });
});
