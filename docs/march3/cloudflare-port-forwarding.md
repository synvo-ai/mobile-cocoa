# Cloudflare Port Forwarding — March 3, 2026

## Problem

When using the Cloudflare tunnel solution, the tunnel exposes a single URL that points to the local proxy on port 9443. The proxy can route requests to any `localhost:<port>` via the `_targetPort` query param or `X-Target-Port` header. However, before this change, the proxy accepted **any** valid port (1024–65535) with no access control. Users had no way to manage which ports were exposed, and there was no UI to configure port forwarding from the mobile app.

For a mobile user to preview a page served on `localhost:8080`, they need that port explicitly exposed through the tunnel.

## Solution

Added a managed port whitelist with a mobile UI (Cloudflare-exclusive) and file-watch-based hot reload on the proxy.

```
Mobile App  ─→  Cloudflare Tunnel  ─→  Proxy :9443  ─→  localhost:<port>
                                          │
                                    reads config/ports.json
                                    (fs.watch hot-reload)
```

### Three layers

1. **Port whitelist** (`config/ports.json`) — persistent JSON file listing allowed ports
2. **Server API** (`/api/ports`) — CRUD endpoints for managing the whitelist
3. **Mobile UI** (`PortForwardingModal`) — full-screen modal for add/remove/apply, only visible in cloudflare mode

## Files Changed

### New files

| File | Purpose |
|------|---------|
| `config/ports.json` | Port whitelist config (default: dev server 3456, built-in) |
| `server/portRegistry.js` | Read/write port config, CRUD operations, validation |
| `server/routes/ports.js` | REST API: `GET/POST/DELETE /api/ports`, `POST /api/ports/apply` |
| `apps/mobile/src/components/ports/PortForwardingModal.tsx` | Full-screen modal for managing port forwarding |

### Modified files

| File | Change |
|------|--------|
| `server/utils/proxy.js` | Added port whitelist from `ports.json`, `fs.watch` hot-reload, 403 on non-whitelisted ports |
| `server/routes/config.js` | Added `overlayNetwork` field to `GET /api/config` |
| `server/routes/index.js` | Registered port routes |
| `apps/mobile/src/components/icons/ChatActionIcons.tsx` | Added `PortForwardIcon` |
| `apps/mobile/src/components/chat/InputPanel.tsx` | Added "Ports" button in system menu (cloudflare-only) |
| `apps/mobile/src/components/chat/ChatInputDock.tsx` | Pass-through for `onOpenPortForwarding`, `isCloudflareMode` |
| `apps/mobile/src/components/chat/ChatModalsSection.tsx` | Renders `PortForwardingModal` when in cloudflare mode |
| `apps/mobile/src/components/types/chatModalTypes.ts` | Added `onOpenPortForwarding` to handler types |
| `apps/mobile/src/components/hooks/useChatModalsController.ts` | Added `portForwarding` modal state |
| `apps/mobile/src/components/pages/ChatPage.tsx` | Added `ChatPagePortForwarding` type, passed to shell |
| `apps/mobile/src/components/pages/ChatPageShell.tsx` | Wired port forwarding props to input dock |
| `apps/mobile/src/components/pages/ChatPageSections.tsx` | Added port forwarding handler to `ChatInputDockSection` |
| `apps/mobile/src/components/pages/buildChatPageProps.ts` | Populated `portForwarding` modal data with `isCloudflareMode()` |
| `apps/mobile/src/services/server/config.ts` | Exported `getConnectionMode()` and `isCloudflareMode()` |

## API Reference

### `GET /api/ports`

Returns the current port whitelist.

```json
{
  "exposedPorts": [
    { "port": 3456, "label": "Dev Server", "builtin": true },
    { "port": 8080, "label": "Web Preview" }
  ]
}
```

### `POST /api/ports`

Add a port to the whitelist.

**Body:** `{ "port": 8080, "label": "Web Preview" }`

- Port must be 1024–65535
- Duplicates return 400
- Returns updated `exposedPorts` array

### `DELETE /api/ports/:port`

Remove a port from the whitelist.

- Built-in ports (e.g. 3456) cannot be removed (returns 400)
- Returns updated `exposedPorts` array

### `POST /api/ports/apply`

Confirms the current config is saved. The proxy watches `config/ports.json` via `fs.watch` and hot-reloads the whitelist automatically within ~100ms of any file change.

### `GET /api/config`

Now includes `overlayNetwork` field:

```json
{
  "sidebarRefreshIntervalMs": 3000,
  "overlayNetwork": "tunnel"
}
```

Values: `"tunnel"` (when `OVERLAY_NETWORK=tunnel`) or `"none"` (default).

## Proxy Behavior

### Whitelist enforcement

The proxy reads `config/ports.json` on startup and builds an in-memory `Set` of allowed ports. The default target port (3456) is always included. Before forwarding any request, the proxy checks:

```
if (!allowedPorts.has(targetPort)) → 403 Forbidden
```

The 403 response includes a descriptive message:

```json
{
  "error": "Port not exposed",
  "message": "Port 9999 is not in the exposed ports whitelist. Add it via the mobile app's Port Forwarding settings.",
  "port": 9999
}
```

### Hot reload

The proxy watches `config/ports.json` with `fs.watch()`. When the file changes:

1. A 100ms debounce timer fires
2. The file is re-read and parsed
3. The in-memory `Set` is replaced with the new port list
4. A log line confirms: `[proxy] Port whitelist reloaded: 3456, 8080`

No process restart is required. The brief disconnect mentioned in the requirements comes from the mobile app optionally disconnecting and reconnecting the SSE stream after apply, using the existing retry logic (`SSE_MAX_RETRIES = 5`, exponential backoff starting at 1s).

## Mobile UI

The "Ports" button appears in the system menu (the `+` dropdown in the input dock) **only** when the app is running in cloudflare mode (`EXPO_PUBLIC_CONNECTION_MODE=cloudflare`). It uses the `isCloudflareMode()` helper exported from `services/server/config.ts`.

The `PortForwardingModal` is a full-screen modal following the same patterns as `ProcessDashboardModal`:

- Header with title, refresh button, close button
- Hero card showing total port count
- "System ports" section (built-in, non-removable)
- "Custom ports" section (user-managed, with delete buttons)
- "Add port" form (port number input + optional label)
- "Apply & Reload Proxy" button

## Verification Results

56 tests passed across 3 suites:

| Suite | Tests |
|-------|-------|
| Port Registry + API Endpoints | 31/31 |
| Proxy Whitelist + Hot Reload | 13/13 |
| E2E User Workflow Simulation | 12/12 |

Key scenarios verified:

- Default port (3456) always accessible
- Non-whitelisted ports blocked with 403
- Adding a port via API makes it accessible through the proxy
- Removing a port blocks it again
- Hot-reload picks up `ports.json` changes within 500ms
- Built-in ports cannot be removed
- Invalid ports (out of range, non-integer) rejected
- Dev server unaffected by port configuration changes
- `overlayNetwork` field correctly reflects tunnel mode
- Zero new TypeScript or linter errors
