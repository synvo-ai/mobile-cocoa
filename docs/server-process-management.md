# Process Management Module

> **Path:** [`server/process/index.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/index.js)

## Function

Creates and manages AI provider processes (Claude, Gemini, Codex) via Pi RPC. Provides both Socket.IO and REST+SSE adapters for client communication.

## Workflow

1. Client sends `submit-prompt` → `createProcessManager` resolves provider and model
2. Spawns a Pi RPC session (`createPiRpcSession`) with the resolved config
3. Streams AI output back to the client via Socket.IO events or SSE
4. Handles input forwarding, process termination, and cleanup on disconnect

## Key Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `shutdown(signal)` | `shutdown("SIGINT")` | Graceful shutdown — kills all spawned children |
| `resolveProvider(fromPayload)` | `resolveProvider("gemini")` | Validates and defaults the provider string |
| `getDefaultModelForProvider(provider)` | `getDefaultModelForProvider("claude")` | Reads default model from `config/models.json` |
| `createProcessManager(socket, opts)` | — | Creates a Socket.IO-based process manager with `handleSubmitPrompt`, `handleInput`, `handleTerminate`, `cleanup` |
| `createSseSocketAdapter(sessionId, session, host)` | — | Wraps SSE `Response` subscribers into a socket-like `emit` interface |
| `createSessionProcessManager(sessionId, session, opts)` | — | Creates a REST+SSE process manager (one Pi process per session) |
| `formatSessionLogTimestamp()` | — | Returns `yyyy-MM-dd_HH-mm-ss` timestamp for log dirs |

## How to Use

```js
// Socket.IO path (used by web client)
import { createProcessManager } from "./server/process/index.js";

const manager = createProcessManager(socket, {
  hasCompletedFirstRunRef: { current: false },
  session_management: null,
  onPiSessionId: (id) => console.log("Pi session:", id),
});

socket.on("submit-prompt", (payload) => manager.handleSubmitPrompt(payload));
socket.on("input", (data) => manager.handleInput(data));
socket.on("claude-terminate", (payload) => manager.handleTerminate(payload));
socket.on("disconnect", () => manager.cleanup());

// REST+SSE path (used by mobile client)
import { createSessionProcessManager } from "./server/process/index.js";

const pm = createSessionProcessManager(sessionId, session, {
  onPiSessionId: (id) => migrateSessionId(oldId, id),
});
pm.handleSubmitPrompt(payload, "localhost:3456");
```

## How to Test

```bash
# Smoke test (SSE session switching)
RAPID_MODE=1 node scripts/smoke-pi-rpc-sse-session-switch.mjs

# Load test (multi-session)
node scripts/load-test-codex-multi-session.mjs
```

## API (Manager Interface)

The manager returned by `createProcessManager` / `createSessionProcessManager` exposes:

| Method | Description |
|--------|-------------|
| `handleSubmitPrompt(payload)` | Start a new AI turn with provider, model, prompt |
| `handleInput(data)` | Forward user input (approval answers, text) to running Pi process |
| `handleTerminate(payload)` | Kill the running AI process |
| `handleResize()` | No-op (PTY resize not used with Pi RPC) |
| `cleanup()` | Kill process and clean up resources |
| `processRunning()` | Returns whether a process is active |
| `getTurnCounter()` | Returns the current conversation turn number |

---

# Pi RPC Session Module

> **Path:** [`server/process/piRpcSession.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/piRpcSession.js)

## Function

Spawns `pi --mode rpc` and manages the JSON-RPC protocol for AI interactions. Maps client providers/models to Pi CLI providers, handles Pi events (message updates, tool execution, approval requests), and streams output to clients.

## Workflow

1. `ensurePiProcess(options)` — spawns `pi --mode rpc` with provider, model, workspace, skills
2. `startTurn({ prompt, options })` — sends a user prompt to the Pi process
3. Pi emits JSON events on stdout → `handlePiEvent(parsed)` routes each event type
4. Events are forwarded to the client via `socket.emit("output", ...)` (slim versions for SSE)
5. `handleInput(data)` — forwards user approval/text input to Pi's stdin
6. `close()` — kills the Pi process

## Key Functions

| Function | Description |
|----------|-------------|
| `createPiRpcSession(opts)` | Factory — returns `{ startTurn, handleInput, hasProcess, isTurnRunning, close }` |
| `getClientProviderToPi()` | Maps `claude→anthropic`, `codex→openai-codex` from `config/pi.json` |
| `toPiModel(clientModel, piProvider)` | Resolves model aliases via `config/models.json` |
| `getPiProviderForModel(clientProvider, model)` | Regex-based routing from `config/pi.json` rules |
| `toAskUserQuestionPayload(request)` | Transforms Pi `extension_ui_request` to `AskUserQuestion` for client modal |
| `slimEventForSse(parsed)` | Strips heavy content from snapshot events to prevent mobile memory issues |
| `handlePiEvent(parsed)` | Routes event types: `message_update`, `turn_end`, `tool_execution_*`, `model_change`, etc. |

## How to Use

```js
import { createPiRpcSession } from "./server/process/piRpcSession.js";

const session = createPiRpcSession({
  socket,
  hasCompletedFirstRunRef: { current: false },
  globalSpawnChildren: new Set(),
  getWorkspaceCwd: () => "/path/to/workspace",
  projectRoot: "/path/to/project",
  onPiSessionId: (id) => console.log("Session ID:", id),
});

// Start an AI turn
await session.startTurn({
  prompt: "Create a hello world app",
  options: { provider: "gemini", model: "gemini-3.1-pro-preview" },
});

// Forward user input (e.g., approval)
session.handleInput('{"answers":[{"answer":"approve"}]}');

// Check status
console.log(session.hasProcess());    // true
console.log(session.isTurnRunning()); // true/false

// Cleanup
session.close();
```

## How to Test

```bash
# Smoke test verifies Pi RPC + SSE session switching end-to-end
RAPID_MODE=1 node scripts/smoke-pi-rpc-sse-session-switch.mjs
```

## API (Session Interface)

| Method | Description |
|--------|-------------|
| `startTurn({ prompt, options })` | Send a prompt to the Pi process |
| `handleInput(data)` | Forward approval answers or text input |
| `hasProcess()` | Whether Pi process is alive |
| `isTurnRunning()` | Whether a conversation turn is active |
| `close()` | Kill Pi process and clean up |
