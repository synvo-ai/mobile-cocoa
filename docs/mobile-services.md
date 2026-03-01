# Mobile App — Chat Services Module

> **Path:** [`apps/mobile/src/services/chat/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/)

## Function

Core state management for the mobile chat UI. Manages SSE connections, message state, session lifecycle (idle/running), permissions, and approval modals. Built as composable React hooks.

## Workflow

1. `useChat()` is the main hook consumed by chat screens
2. On session start, `useChatStreamingLifecycle` opens an `EventSource` to `/api/sessions/:id/stream`
3. SSE events are parsed and dispatched via the provider event dispatcher
4. Messages are accumulated in per-session caches with LRU eviction
5. `useChatActions` provides `submitPrompt`, `sendInput`, `terminate`, `switchSession`
6. `useChatExternalCallbacks` handles side effects (agent notifications, session persistence)

---

## Files

### [`hooks.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/hooks.ts) — Main Hook

| Export | Description |
|--------|-------------|
| `useChat(options?)` | Main hook — returns messages, session state, actions, permissions, connection status |

**Returns:**
- `messages: Message[]` — Current session messages
- `sessionRunning: boolean` — Whether AI is generating
- `waitingForUserInput: boolean` — Whether approval is needed
- `provider: string` — Current provider
- `model: string` — Current model
- `submitPrompt(prompt, opts?)` — Send a prompt
- `sendInput(text)` — Send approval/text input
- `terminate()` — Kill running session
- `switchSession(id)` — Switch to another session
- `permissionDenials` — Current denials
- `pendingAskQuestion` — Pending AskUserQuestion modal data

### [`useChatStreamingLifecycle.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatStreamingLifecycle.ts) — SSE Connection

| Key Aspect | Detail |
|------------|--------|
| SSE connection | Uses `EventSource` with auto-retry (max 5 retries, exponential backoff) |
| Output buffering | 50ms flush interval, 2.4KB draft threshold for boundary-aware chunking |
| Buffer safety | 5MB max buffer to prevent Hermes `RangeError` |
| Event routing | Parses `message`, `end`, `done` SSE events, delegates to `eventDispatcher` |
| Session rekey | Handles Pi session ID changes (`setSessionIdWithRekey`) |

### [`useChatActions.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatActions.ts) — User Actions

| Function | Description |
|----------|-------------|
| `submitPrompt(prompt, opts?)` | POST to `/api/sessions/:id/prompt`, opens SSE stream |
| `sendInput(text)` | POST to `/api/sessions/:id/input` (approval answers) |
| `sendAskUserQuestionAnswer(answers)` | Sends structured AskUserQuestion response |
| `terminate()` | POST to `/api/sessions/:id/terminate` |
| `switchSession(id)` | Changes active session, loads cached or replays from server |
| `createNewSession(provider, model)` | POST to `/api/sessions` |

### [`sessionMessageHandlers.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/sessionMessageHandlers.ts) — Message State

| Function | Description |
|----------|-------------|
| `addMessageForSession(role, content)` | Adds a new message to the session |
| `appendAssistantTextForSession(chunk)` | Appends streaming text to the current assistant message |
| `finalizeAssistantMessageForSession()` | Cleans up draft, strips incomplete tags, transitions to idle |

### [`sessionCacheHelpers.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/sessionCacheHelpers.ts) — Session Cache

| Function | Description |
|----------|-------------|
| `touchSession(sid)` | Marks session as recently used (LRU) |
| `evictOldestSessions(...)` | Evicts oldest sessions when cache exceeds 15 |
| `getOrCreateSessionState(map, sid)` | Gets or initializes session live state |
| `getOrCreateSessionMessages(map, sid)` | Gets or initializes session messages array |
| `moveSessionCacheData(current, next, ...)` | Migrates cache data when session ID changes |

### [`hooksTypes.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/hooksTypes.ts) — Type Definitions

| Type | Description |
|------|-------------|
| `SessionRuntimeState` | `"idle" \| "running"` |
| `SessionLiveState` | `{ sessionState: SessionRuntimeState }` |
| `LastRunOptions` | Provider, permission mode, tools for retry |
| `UseChatOptions` | Hook configuration options |

### [`hooksSerialization.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/hooksSerialization.ts) — Payload Utilities

Normalizes submit-prompt payloads and provides stable JSON serialization.

## How to Use

```tsx
import { useChat } from "@/services/chat/hooks";

function ChatScreen() {
  const {
    messages, sessionRunning, submitPrompt, sendInput, terminate
  } = useChat();

  const handleSend = (text: string) => {
    submitPrompt(text, { provider: "gemini", model: "gemini-3.1-pro-preview" });
  };

  return (
    <View>
      {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
      <Input onSubmit={handleSend} />
    </View>
  );
}
```

## How to Test

```bash
# Unit tests
cd apps/mobile
npx jest src/services/chat/__tests__/

# Integration: run the mobile app and test manually
npm run dev:mobile
```

## API

All exports are TypeScript types and React hooks. No REST endpoints — this module is the client-side consumer of the server's REST+SSE API.

---

# Mobile App — Provider Services Module

> **Path:** [`apps/mobile/src/services/providers/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/)

## Function

Parses and dispatches AI stream events from Pi RPC protocol. Uses the Strategy pattern — each event type maps to a handler, and new types can be added without modifying the dispatcher.

## Files

### [`eventDispatcher.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/eventDispatcher.ts)

| Function | Description |
|----------|-------------|
| `createEventDispatcher(ctx)` | Creates a dispatcher that routes events by type |
| `createHandlerRegistry(ctx)` | Builds handler map for all Pi event types |
| `normalizeAskUserQuestionPayload(data)` | Normalizes AskUserQuestion data for modal display |
| `processPermissionDenials(denials, data)` | Filters denials, extracts AskUserQuestion payloads |

**Handled event types:**
- `message_update` — Assistant text deltas
- `turn_end` / `agent_end` — Turn completion
- `tool_execution_start` / `tool_execution_end` — Tool use display
- `extension_ui_request` — AskUserQuestion modal
- `model_change` — Provider/model switch
- `session_start` — Session metadata

### [`stream.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/stream.ts)

Type definitions and guards for Claude, Gemini, and Codex stream formats:

| Function | Description |
|----------|-------------|
| `isClaudeStreamOutput(data)` | Type guard for Claude events |
| `isGeminiStreamOutput(data)` | Type guard for Gemini events |
| `isProviderStream(data)` | Checks if data is a recognized provider event |
| `isProviderSystemNoise(data)` | Filters system noise (init, heartbeat, etc.) |
| `stripAnsi(str)` | Removes ANSI escape codes |
| `stripTrailingIncompleteTag(str)` | Cleans incomplete HTML/XML tags from stream |

### [`types.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/types.ts)

| Type/Function | Description |
|---------------|-------------|
| `EventContext` | Context passed to all handlers (setters for messages, permissions, model, etc.) |
| `EventHandler` | `(data: Record<string, unknown>) => void` |
| `ToolUseRecord` | Matches tool_result back to tool_use |
| `applySessionStartMetadata(data, ctx)` | Shared session start formatter |
| `appendToolUseDisplayLine(ctx, name, input)` | Formats tool use for chat display |
| `formatToolUseForDisplay(name, input)` | Markdown formatting for tool calls |
| `appendSnapshotTextDelta(ctx, fullText)` | Deduplicates snapshot text with streamed content |

## How to Use

```ts
import { createEventDispatcher } from "@/services/providers/eventDispatcher";

const dispatch = createEventDispatcher({
  appendAssistantText: (chunk) => { /* update UI */ },
  addMessage: (role, content) => { /* add message */ },
  setPermissionDenials: (denials) => { /* show modal */ },
  setWaitingForUserInput: (v) => { /* toggle input */ },
  // ... other context methods
});

// Process an SSE event
dispatch({ type: "message_update", delta: { text: "Hello" } });
```

## How to Test

```bash
cd apps/mobile
npx jest src/services/providers/__tests__/
```

---

# Mobile App — Server Config Module

> **Path:** [`apps/mobile/src/services/server/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/server/)

## Files

### [`config.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/server/config.ts)

| Function | Description |
|----------|-------------|
| `getConnectionMode()` | Returns `"direct"` or `"cloudflare"` based on env |
| `getBaseUrlFromEnv()` | Resolves server base URL from `EXPO_PUBLIC_SERVER_URL` |
| `createDefaultServerConfig()` | Creates `IServerConfig` with `getBaseUrl()` and `resolvePreviewUrl()` |
| `getDefaultServerConfig()` | Singleton accessor |
| `normalizeBaseUrl(rawUrl)` | Strips trailing slashes, validates URL |
| `getServerHostOverride()` | Returns host override from env (for tunnel/LAN) |

### [`modelsApi.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/server/modelsApi.ts)

| Function | Description |
|----------|-------------|
| `fetchModelsConfig()` | Fetches `/api/models` from server (cached) |
| `invalidateModelsCache()` | Forces re-fetch on next call |
| `getModelsConfigSync()` | Returns cached config or fallback |

---

# Mobile App — Other Services

### [`agentNotifications.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/agentNotifications.ts)

Local notifications when the AI agent finishes or needs approval.

| Function | Description |
|----------|-------------|
| `ensureNotificationPermissions()` | Requests permissions, creates Android channel |
| `notifyAgentFinished()` | Haptic + notification on agent completion |
| `notifyApprovalNeeded(title?)` | Haptic + notification for human-in-the-loop |

### [`sessionStore.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/sessionStore.ts)

Persists last used provider/model to AsyncStorage.

| Function | Description |
|----------|-------------|
| `loadLastUsedProviderModel()` | Loads persisted provider/model preference |
| `setLastUsedProviderModel(provider, model)` | Saves preference |

### [`file/service.ts`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/file/service.ts)

| Function | Description |
|----------|-------------|
| `createWorkspaceFileService(serverConfig)` | Creates `IWorkspaceFileService` that fetches files via `/api/workspace-file` |
