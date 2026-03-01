# Session Registry Module

> **Path:** [`server/sessionRegistry.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/sessionRegistry.js)

## Function

Global in-memory registry mapping `sessionId → session state`. Manages the lifecycle of active AI sessions for the REST+SSE flow. Each session holds a process manager, SSE subscriber set, provider/model info, and log metadata.

## Workflow

1. Client creates a session via `POST /api/sessions` → `createSession()` is called
2. A `processManager` is created (one Pi RPC process per session)
3. SSE subscribers are added/removed as clients connect/disconnect via `/api/sessions/:id/stream`
4. When Pi emits a native session ID, `migrateSessionId()` re-keys the registry entry
5. On session delete, `removeSession()` cleans up the process and closes all SSE connections

## Key Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `createSession` | `(sessionId, provider, model, options?)` | Creates session with process manager, returns existing if ID already registered |
| `getSession` | `(sessionId)` | Direct lookup by exact ID |
| `getAllSessions` | `()` | Returns all active sessions (for merging with disk-based list) |
| `resolveSession` | `(sessionId)` | Fuzzy lookup — tries exact match, then UUID suffix match |
| `migrateSessionId` | `(fromId, toId)` | Re-keys session when Pi emits its native session ID |
| `removeSession` | `(sessionId)` | Kills process, closes SSE subscribers, deletes from registry |
| `subscribeToSession` | `(sessionId, res)` | Adds Express `Response` to SSE subscriber set |
| `unsubscribeFromSession` | `(sessionId, res)` | Removes from subscriber set |

## Session Shape

```js
{
  id: string,                  // Session ID (may change via migrateSessionId)
  processManager: {            // createSessionProcessManager instance
    processRunning, handleSubmitPrompt, handleInput, handleTerminate, cleanup
  },
  subscribers: Set<Response>,  // Active SSE connections
  provider: string,            // "claude" | "gemini" | "codex"
  model: string,               // e.g. "gemini-3.1-pro-preview"
  sessionLogTimestamp: string,  // Log directory timestamp
  existingSessionPath: string,  // JSONL file path (survives rekey)
}
```

## How to Use

```js
import { createSession, getSession, removeSession, subscribeToSession } from "./server/sessionRegistry.js";

// Create
const session = createSession("abc-123", "gemini", "gemini-3.1-pro-preview");

// Subscribe SSE client
subscribeToSession("abc-123", res);

// Submit prompt
session.processManager.handleSubmitPrompt({ prompt: "Hello" });

// Cleanup
removeSession("abc-123");
```

## How to Test

```bash
# Smoke test covers session creation, streaming, and cleanup
RAPID_MODE=1 node scripts/smoke-pi-rpc-sse-session-switch.mjs
```

## API

This module is internal — consumed by `server/routes/sessions.js`. It does not expose HTTP endpoints directly.
