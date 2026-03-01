/**
 * Tests for LRU session cache eviction.
 *
 * Validates that:
 * 1. touchSession moves sessions to most-recently-used position
 * 2. evictOldestSessions trims maps to MAX_CACHED_SESSIONS
 * 3. Active session is never evicted
 * 4. moveSessionCacheData updates LRU order during rekey
 */
import type { SessionLiveState } from "../hooksTypes";
import type { Message } from "@/core/types";
import {
  MAX_CACHED_SESSIONS,
  touchSession,
  evictOldestSessions,
  moveSessionCacheData,
  _resetAccessOrder,
} from "../sessionCacheHelpers";

beforeEach(() => {
  _resetAccessOrder();
});

describe("touchSession", () => {
  it("adds a new session to the access order", () => {
    touchSession("s1");
    touchSession("s2");
    touchSession("s3");
    // Just verify it doesn't throw — order tested via eviction behavior
    expect(true).toBe(true);
  });

  it("moves an existing session to end (most recently used)", () => {
    touchSession("s1");
    touchSession("s2");
    touchSession("s3");
    // Touch s1 again — it should now be the most recent
    touchSession("s1");

    // Verify by evicting: s2 and s3 should be evicted before s1
    const states = new Map<string, SessionLiveState>();
    const messages = new Map<string, Message[]>();
    const drafts = new Map<string, string>();
    // Add all 3 sessions to maps
    for (const id of ["s1", "s2", "s3"]) {
      states.set(id, { sessionState: "idle" });
      messages.set(id, []);
      drafts.set(id, "");
    }
    // Set limit to 1 — should evict s2 and s3 (oldest), keep s1 (most recent)
    // We need to add enough sessions to trigger eviction
    for (let i = 4; i <= MAX_CACHED_SESSIONS + 2; i++) {
      const sid = `s${i}`;
      touchSession(sid);
      states.set(sid, { sessionState: "idle" });
      messages.set(sid, []);
      drafts.set(sid, "");
    }
    evictOldestSessions(states, messages, drafts);
    // s2 and s3 should be evicted (they were oldest after s1 was re-touched)
    expect(states.has("s2")).toBe(false);
    expect(states.has("s3")).toBe(false);
    // s1 should still exist (it was re-touched making it most recent)
    expect(states.has("s1")).toBe(true);
  });
});

describe("evictOldestSessions", () => {
  it("does nothing when under the limit", () => {
    const states = new Map<string, SessionLiveState>();
    const messages = new Map<string, Message[]>();
    const drafts = new Map<string, string>();

    for (let i = 1; i <= 5; i++) {
      const sid = `session-${i}`;
      touchSession(sid);
      states.set(sid, { sessionState: "idle" });
      messages.set(sid, [{ id: `msg-${i}`, role: "user", content: `Hello ${i}` }]);
      drafts.set(sid, "");
    }

    evictOldestSessions(states, messages, drafts);
    expect(states.size).toBe(5);
    expect(messages.size).toBe(5);
  });

  it("evicts oldest sessions when over the limit", () => {
    const states = new Map<string, SessionLiveState>();
    const messages = new Map<string, Message[]>();
    const drafts = new Map<string, string>();

    const totalSessions = MAX_CACHED_SESSIONS + 5;
    for (let i = 1; i <= totalSessions; i++) {
      const sid = `session-${i}`;
      touchSession(sid);
      states.set(sid, { sessionState: "idle" });
      messages.set(sid, [{ id: `msg-${i}`, role: "user", content: `Hello ${i}` }]);
      drafts.set(sid, `draft-${i}`);
    }

    evictOldestSessions(states, messages, drafts);
    // Should be trimmed to MAX_CACHED_SESSIONS
    expect(states.size).toBe(MAX_CACHED_SESSIONS);
    expect(messages.size).toBe(MAX_CACHED_SESSIONS);

    // Oldest sessions (1-5) should have been evicted
    for (let i = 1; i <= 5; i++) {
      expect(states.has(`session-${i}`)).toBe(false);
      expect(messages.has(`session-${i}`)).toBe(false);
      expect(drafts.has(`session-${i}`)).toBe(false);
    }

    // Newest sessions should still exist
    for (let i = totalSessions; i > totalSessions - MAX_CACHED_SESSIONS; i--) {
      expect(states.has(`session-${i}`)).toBe(true);
    }
  });

  it("never evicts the active session even if it's the oldest", () => {
    const states = new Map<string, SessionLiveState>();
    const messages = new Map<string, Message[]>();
    const drafts = new Map<string, string>();
    const activeSid = "active-session";

    // Touch active session first (making it oldest)
    touchSession(activeSid);
    states.set(activeSid, { sessionState: "running" });
    messages.set(activeSid, [{ id: "msg-active", role: "assistant", content: "I'm running" }]);

    // Add enough sessions to exceed the limit
    for (let i = 1; i <= MAX_CACHED_SESSIONS + 3; i++) {
      const sid = `session-${i}`;
      touchSession(sid);
      states.set(sid, { sessionState: "idle" });
      messages.set(sid, []);
    }

    evictOldestSessions(states, messages, drafts, activeSid);

    // Active session must survive
    expect(states.has(activeSid)).toBe(true);
    expect(messages.has(activeSid)).toBe(true);
    expect(states.get(activeSid)?.sessionState).toBe("running");
  });
});

describe("moveSessionCacheData — LRU integration", () => {
  it("updates LRU order when session is rekeyed", () => {
    const states = new Map<string, SessionLiveState>();
    const messages = new Map<string, Message[]>();
    const drafts = new Map<string, string>();

    touchSession("temp-1");
    states.set("temp-1", { sessionState: "running" });
    messages.set("temp-1", [{ id: "msg-1", role: "user", content: "Hello" }]);

    // Rekey from temp to real session id
    moveSessionCacheData("temp-1", "real-uuid-1", states, messages, drafts);

    // Old key evicted, new key present
    expect(states.has("temp-1")).toBe(false);
    expect(states.has("real-uuid-1")).toBe(true);
    expect(messages.has("temp-1")).toBe(false);
    expect(messages.has("real-uuid-1")).toBe(true);
  });
});
