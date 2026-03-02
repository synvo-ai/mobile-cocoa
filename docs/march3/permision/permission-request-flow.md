# Permission flow: YOLO(confirm) toggle, permission modal, and background-session notification

**Date:** March 3, 2026  
**Area:** Server (Pi bridge + session registry + session APIs) + Mobile app (chat UI + SSE lifecycle + side effects)  
**Feature goal:**  
1. Let users globally toggle YOLO confirm behavior.  
2. Prompt users to allow/reject tool permission requests in a modal flow when YOLO is off.  
3. Show notification feedback when the active session or any background session is waiting on permission.

---

## 1. Problem statement

Tools can raise permission requests at runtime. Before this update there were two gaps:

- Users could not explicitly control confirm behavior (“YOLO”/auto-approve) per session send path.
- Non-blocking “waiting for permission” state in inactive/background sessions was not surfaced reliably, causing hidden stalled sessions.

This implementation addresses both by introducing:

- A shared, user-controlled approval mode (`prompt` vs `auto_edit`).
- A typed permission prompt modal path (`AskUserQuestion` + confirm branch).
- A session-wide waiting indicator pushed through store/API and consumed by notification side-effects.

---

## 2. Definitions and modes

### 2.1 Permission request classes

1. **Confirm-style request**
   - Server event method: `confirm` (and related extension request methods that are semantically confirm-like).
   - UX: binary choice (Allow / Reject).
2. **Question-style request**
   - Server maps to `AskUserQuestion`.
   - UX: one or more question cards; users select options and submit an answer payload.

### 2.2 Approval mode values

- `prompt` (default/manual): every confirm-style request is surfaced to the user.
- `auto_edit` (YOLO): confirm-style requests are auto-approved server-side when allowed.

### 2.3 “Waiting” concept

`waitingForPermission` means the server currently has an outstanding permission-dependent request in that session that requires user resolution.

---

## 3. User control: YOLO toggle -> `auto_edit`

### 3.1 UI surface

The toggle appears in `InputPanel.tsx` and maps directly to the boolean state `isAutoApproveToolConfirm`.

- [InputPanel.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/InputPanel.tsx)
- [App.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/App.tsx)

### 3.2 End-to-end value propagation

1. `App.tsx` stores the user preference and passes it through the chat stack.
2. `ChatInputDock.tsx` derives:
   - `auto_edit` when toggle ON
   - `prompt` when toggle OFF
3. `ChatActionController.tsx` includes it in outbound action context as `approvalMode`.
4. `useChatActions.ts` serializes `approvalMode` into API request payload and the server request path.

### 3.3 Payload contract at send time

Request payload includes:

```json
{
  "prompt": "...",
  "provider": "..."
  "model": "...",
  "permissionMode": "...",
  "approvalMode": "prompt | auto_edit",
  "sessionId": "...",
  "allowedTools": ["optional array when retrying"]
}
```

`approvalMode` is authoritative for confirm auto-approval handling.

---

## 4. Server-side request handling (Pi integration)

### 4.1 Entry point and waiting-state behavior

When the server receives extension style UI requests in `piRpcSession`:

- `select`, `confirm`, `input`, `editor`:
  - mark the session as `waitingForPermission = true`
  - generate and emit `askPayload` (or auto-response if allowed)
- non-blocking request types (`notify`, `setStatus`, etc.) do not set waiting state.

Primary files:

- [piRpcSession.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/piRpcSession.js)
- [sessionRegistry.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/sessionRegistry.js)

### 4.2 Confirm auto-approval path

`shouldAutoApproveConfirm` in `piRpcSession.js` returns true when:

- the current turn/request context has `approvalMode === "auto_edit"` **or**
- legacy/global `autoApproveToolConfirm` config is enabled.

If true:

- server emits `extension_ui_response` immediately with `confirmed: true`
- modal is not opened on the client for that confirm request
- waiting flag is expected to be cleared by subsequent lifecycle transition

Example emitted packet:

```json
{
  "type": "extension_ui_response",
  "id": "<request-id>",
  "confirmed": true
}
```

If false, permission request proceeds through AskUserQuestion payload transformation.

### 4.3 AskUserQuestion payload conversion

`piEventHandler.js` converts extension requests using:

- `toAskUserQuestionPayload`
  - `tool_name: "AskUserQuestion"`
  - `tool_use_id` and `uuid` mapped from request id
  - `requestMethod` preserved (`confirm`, `select`, etc.)
  - normalized `tool_input.questions[]` with answer options and metadata

This keeps server stream schema consistent regardless of source tool.

Files:

- [piEventHandler.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/piEventHandler.js)
- [stream parser references in mobile](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/stream.ts)

### 4.4 Input endpoint behavior

`handleInput` accepts and routes:

- `{ approved: boolean }` for confirm flows
- `{ message: { content: [...] } }` for tool-question structured response
- raw string fallback in compatibility paths

Server parses answers via:
- `parseAskQuestionAnswersFromInput`
- `decideApprovalFromAnswers`

File: [piEventHandler.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/piEventHandler.js)

---

## 5. Transport parsing and stream-to-state bridge on mobile

### 5.1 Stream detection and normalization

- `isProviderStream` identifies provider events that may carry permission payloads.
- `isAskUserQuestionPayload` and `normalizeAskUserQuestionPayload` validate and normalize stream packets before touching app state.
- Request method normalization supports multiple shapes (`requestMethod`, `request_method`, `input.requestMethod`, etc.).
- Question payload includes mapped IDs and answer metadata ready for modal rendering.

File: [eventDispatcher.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/eventDispatcher.ts), [stream.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/stream.ts)

### 5.2 Permission denials and mixed-event handling

`processPermissionDenials` separates:

- AskUserQuestion-like denials meant for modal flow
- generic permission denials shown as banners

This prevents losing a true permission question when denials are bundled with regular stream metadata.

### 5.3 State transitions triggered by stream

State updates happen in:

- [useChatStreamingLifecycle.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatStreamingLifecycle.ts)
- [hooks.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/hooks.ts)

Important updates:

- `setPendingAskQuestion(payload)` only when normalized question exists.
- `setPermissionDenials(list)` for non-AskUserQuestion denials.
- `setWaitingForUserInput(true)` when input/permission request stream is detected.
- On resolution, UI action handlers clear these states.

---

## 6. Modal UX implementation details

### 6.1 Render path

- `ChatModalsSection.tsx` renders modal based on `pendingAskQuestion`.
- It passes:
  - `pendingAskQuestion`
  - `onSubmitAskQuestion`
  - `onPermissionDecision`
- `AskQuestionModal.tsx` renders two branches:

### 6.2 Confirm branch (`requestMethod === "confirm"`)

- Title: “Permission request”
- Actions:
  - **Reject** → `onPermissionDecision(false)`
  - **Allow** → `onPermissionDecision(true)`
  - optional **Cancel** -> reject + close

### 6.3 Question branch (multiple cards)

- Displays each question card in order.
- Supports selection validation and card-level progress.
- Final confirm disabled until all required/visible selections are present.

Files:

- [ChatModalsSection.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/ChatModalsSection.tsx)
- [AskQuestionModal.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/AskQuestionModal.tsx)

### 6.4 Permission denial banners (non-blocking UX)

- `PermissionDenialBanner.tsx` shows denied tool names/reasons with affordance:
  - Dismiss
  - Retry with allowed tools
- Integrated into message list rendering path.

Files:

- [PermissionDenialBanner.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/common/PermissionDenialBanner.tsx)
- [ChatMessageList.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/ChatMessageList.tsx)

---

## 7. Submission and retries

### 7.1 API endpoint

Both confirm and question answers are posted to:

- `POST /api/sessions/:sessionId/input`

### 7.2 Confirm answer

`submitPermissionDecision(approved: boolean)` posts:

```json
{ "approved": true }
```

or

```json
{ "approved": false }
```

After submit (success path):

- `pendingAskQuestion` cleared
- `waitingForUserInput` cleared
- `permissionDenials` cleared (where applicable)

### 7.3 Structured answer payload

`submitAskQuestionAnswer(answers[])` posts:

```json
{
  "message": {
    "content": [
      {
        "type": "tool_result",
        "content": "[{ ...serialized answer payload ... }]"
      }
    ]
  }
}
```

### 7.4 Retry behavior

`retryAfterPermission(...)`:

- extracts allowed tools from existing denials
- repopulates optional `allowedTools`
- reuses existing session metadata
- can accept optional `retryPrompt` for user context

File: [useChatActions.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatActions.ts)

---

## 8. Waiting notifications: active session vs background session

### 8.1 Active session

`SessionSideEffectManager.tsx` monitors local session state:

- `pendingAskQuestion != null`
- `waitingForUserInput == true`
- `permissionDenials.length > 0`

When any are true, it calls `notifyApprovalNeeded()` so the currently open session explicitly surfaces need-for-attention feedback.

### 8.2 Background sessions

The same manager builds:

- `waitingSet = {session.id | session.waitingForPermission === true && session.id !== activeSessionId}`

If set changes (difference from previous snapshot), it triggers a background notification:

- `Session <id> is waiting for permission` when one session enters waiting state
- `N sessions are waiting for permission` when more than one

This addresses stale/hidden stalls when the user switches to another conversation but a previous one still needs action.

### 8.3 Notification sink

Implemented through:

- [agentNotifications.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/agentNotifications.ts)

Platform behavior:

- Native runtimes: notification + haptics
- Expo Go / web: notification shim path no-ops, haptic kept

---

## 9. Background session correctness proof (important edge case)

When a user opens a new session:

- Existing server-side sessions are still active unless explicitly terminated.
- A background session can continue tool execution and eventually emit `waitingForPermission`.
- Because session management polling (`/api/sessions/status`) is independent of active SSE stream subscription, waiting state is still discoverable.
- `SessionSideEffectManager` cross-checks non-active sessions and emits notifications whenever these sessions enter waiting state.

Result: a user can switch sessions without losing permission requests from previous running sessions.

---

## 10. Relevant server and client API/state touch points

### 10.1 Server

- [sessions.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/sessions.js)  
  - exposes `waitingForPermission` on session status/list responses.
- [sessionRegistry.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/sessionRegistry.js)  
  - stores/wires waiting flags on session records.
- [piRpcSession.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/piRpcSession.js)  
  - sets and consumes permission state; confirm auto-approval.
- [piEventHandler.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/piEventHandler.js)  
  - AskUserQuestion conversion + answer parsing.

### 10.2 Client state/store/API

- [sessionManagementStore.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/state/sessionManagementStore.ts)
- [useSessionManagementSync.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/features/app/useSessionManagementSync.ts)
- [hooks.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/hooks.ts)
- [hooksSerialization.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/hooksSerialization.ts)
- [useChatActions.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatActions.ts)
- [eventDispatcher.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/eventDispatcher.ts)
- [stream.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/stream.ts)
- [useChatStreamingLifecycle.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatStreamingLifecycle.ts)

### 10.3 UI controllers/components

- [ChatActionController.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/controllers/ChatActionController.tsx)
- [ChatPage.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/pages/ChatPage.tsx)
- [ChatPageSections.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/pages/ChatPageSections.tsx)
- [ChatModalsSection.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/ChatModalsSection.tsx)
- [AskQuestionModal.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/AskQuestionModal.tsx)
- [SseSessionController.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/controllers/SseSessionController.tsx)
- [SessionSideEffectManager.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/controllers/SessionSideEffectManager.tsx)

---

## 11. Sequence (condensed)

1. User sends prompt with `auto_approve` toggle ON/OFF.
2. `approvalMode` reaches server via submit payload.
3. Server receives extension request:
   - if confirm + auto mode => auto-response sent
   - else => AskUserQuestion payload created and waiting flag set
4. Mobile stream dispatch normalizes payload:
   - waiting flags updated
   - modal queued for confirm or question branch
5. User submits decision/answer.
6. Client posts `/api/sessions/:sessionId/input` and clears pending permission state.
7. Session polling reports waiting state changes.
8. `SessionSideEffectManager` emits active/bkg notifications accordingly.

---

## 12. Edge cases and resiliency

- `requestMethod` in unexpected fields is normalized with fallback lookups.
- Empty/malformed AskUserQuestion payload:
  - avoids hard crash by not rendering modal with invalid question arrays
  - fallback to denial/banner/notification path if available
SSE termination or stream close:
- lifecycle handles flag reset to avoid stale “waiting” UI.
Session switch:
- old session SSE is unsubscribed locally while server-side session execution is preserved.
- permission denials state is cleared after explicit submit/resolution.

---

## 13. Files referenced

- [App.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/App.tsx)
- [InputPanel.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/InputPanel.tsx)
- [ChatInputDock.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/ChatInputDock.tsx)
- [ChatActionController.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/controllers/ChatActionController.tsx)
- [ChatModalsSection.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/ChatModalsSection.tsx)
- [AskQuestionModal.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/AskQuestionModal.tsx)
- [ChatPage.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/pages/ChatPage.tsx)
- [ChatPageSections.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/pages/ChatPageSections.tsx)
- [buildChatPageProps.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/pages/buildChatPageProps.ts)
- [SseSessionController.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/controllers/SseSessionController.tsx)
- [SessionSideEffectManager.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/controllers/SessionSideEffectManager.tsx)
- [sessionManagementStore.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/state/sessionManagementStore.ts)
- [useSessionManagementSync.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/features/app/useSessionManagementSync.ts)
- [agentNotifications.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/agentNotifications.ts)
- [hooks.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/hooks.ts)
- [hooksSerialization.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/hooksSerialization.ts)
- [useChatActions.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatActions.ts)
- [useChatStreamingLifecycle.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/chat/useChatStreamingLifecycle.ts)
- [stream.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/stream.ts)
- [eventDispatcher.ts](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/services/providers/eventDispatcher.ts)
- [PermissionDenialBanner.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/common/PermissionDenialBanner.tsx)
- [ChatMessageList.tsx](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/apps/mobile/src/components/chat/ChatMessageList.tsx)
- [piRpcSession.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/piRpcSession.js)
- [piEventHandler.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/process/piEventHandler.js)
- [sessions.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/sessions.js)
- [sessionRegistry.js](/Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/sessionRegistry.js)
