# Vibe Coding Everywhere

Part of the [LoVC (Life of Vibe Coding)](https://github.com/Life-Of-Vibe-Coding) community.

Web and mobile clients that connect to a local AI coding assistant via Socket.IO. Uses **Pi (pi-mono)** as the unified coding agent supporting Claude, Gemini, and Codex through a single protocol.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Mobile Setup](#mobile-setup)
- [API Reference](#api-reference)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

## Overview

This project provides a web-based and mobile interface for interacting with AI coding assistants. It consists of:

- **Server**: Express + Socket.IO that spawns Pi (`pi --mode rpc`) for Claude, Gemini, and Codex
- **Web Client**: HTML/JS chat UI served at the root URL
- **Mobile Client**: Expo React Native app for iOS/Android devices

## Quick Start

See [Quick Start Guide](docs/QUICKSTART.md) for the fastest setup.

### Prerequisites

- Node.js (v18+)
- [Pi](https://github.com/badlogic/pi-mono) coding agent: `npm i -g @mariozechner/pi-coding-agent`. Pi supports Claude, Codex, and Gemini via subscription-based auth; run `pi` and `/login` once to authenticate. No API keys required.

### Installation

```bash
npm install
```

### Run the Server

```bash
npm start
```

The server listens on `http://localhost:3456` (configurable via `PORT` env var).

For development with auto-restart:

```bash
npm run dev
```
test smoke test
```bash
RAPID_MODE=1 node scripts/smoke-pi-rpc-sse-session-switch.mjs
```
### Access the Web Client

Open http://localhost:3456 in your browser.

### Run the Mobile App

See [Mobile Setup](#mobile-setup) below.

---

## Architecture

```
┌─────────────────┐     Socket.IO      ┌──────────────────┐
│   Web Client    │ ◄────────────────► │   Express Server │
│   (Browser)     │                    │                  │
└─────────────────┘                    └────────┬─────────┘
                                                │
┌─────────────────┐     Socket.IO      ┌───────▼─────────┐
│  Mobile Client  │ ◄────────────────► │ Pi (pi-mono)    │
│  (iOS/Android)  │                    │ Claude/Gemini/  │
└─────────────────┘                    │ Codex           │
                                       └─────────────────┘
```

### Server Structure

The server is organized into modular components:

```
server/
├── config/         # Environment configuration
├── utils/          # Utility functions (ANSI stripping, workspace tree)
├── process/        # AI provider process management (Pi RPC)
│   ├── index.js    # createProcessManager, shutdown
│   └── piRpcSession.js  # Pi RPC (unified protocol for Claude/Gemini/Codex)
├── routes/         # Express API routes
└── socket/         # Socket.IO event handlers
```

### Mobile App Structure

The mobile app follows a service-oriented architecture:

```
apps/mobile/src/
├── components/     # React components by feature
│   ├── chat/       # Chat UI components
│   ├── file/       # File viewer, sidebar
│   ├── preview/    # Web preview, terminal output
│   └── common/     # Shared components
├── core/           # Domain types and interfaces
├── services/       # Business logic
│   ├── socket/     # Socket connection hook
│   ├── server/     # Server configuration
│   ├── file/       # File operations
│   └── providers/  # AI provider event handling (Claude, Gemini, Codex, Pi)
└── theme/          # Styling constants
```

### Design Patterns

- **Dependency Injection**: Server config and file services are injected for testability
- **Strategy Pattern**: Claude events are dispatched via pluggable handlers
- **Interface Segregation**: Components depend on small, focused interfaces

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3456` |
| `WORKSPACE` / `WORKSPACE_CWD` | AI CLI working directory | Server directory |
| `DEFAULT_PROVIDER` | AI provider: `claude`, `gemini`, or `codex` | `gemini` |
| `USE_PI_RPC` | Use Pi for all providers (unified protocol). Requires Pi CLI: `npm i -g @mariozechner/pi-coding-agent` | `false` |
| `PI_CLI_PATH` | Path to Pi CLI binary (default: `pi` on PATH) | `pi` |
| `PI_AUTO_APPROVE_TOOL_CONFIRM` | Auto-approve Pi tool execution confirm dialogs (prevents blocking when approval modal is not shown) | unset |
| `DEFAULT_PERMISSION_MODE` | Claude permission mode | `bypassPermissions` |
| `DEFAULT_GEMINI_APPROVAL_MODE` | Gemini approval mode: `default`, `auto_edit`, `plan` | `auto_edit` |
| `SIDEBAR_REFRESH_INTERVAL_MS` | File tree refresh interval | `3000` |

### Command Line

Set workspace via command line:

```bash
# Positional argument
npm start -- /path/to/project

# Explicit flag
node server.js --workspace /path/to/project
```

---

## Mobile Setup

### Option A: Simulator / Local Development

1. Start the server:
   ```bash
   npm start
   ```

2. In another terminal, start the mobile app:
   ```bash
   npm run dev:mobile
   ```

3. Open in iOS Simulator or Android emulator.

### Option B: Physical Device (different network)

Use **Cloudflare Tunnel** so the app can reach your dev server from any network. See [Cloudflare Tunnel guide](docs/CLOUDFLARE_TUNNEL.md).

1. From repo root: `npm run dev:cloudflare` (starts proxy, dev server, and tunnel).
2. When the tunnel URL appears, in a second terminal run:
   ```bash
   EXPO_PUBLIC_SERVER_URL=https://YOUR_TUNNEL_URL npm run dev:mobile:cloudflare
   ```
3. Scan the QR code with Expo Go on your phone.

### Mobile Environment Variables

- `EXPO_PUBLIC_SERVER_URL`: Server URL (set automatically by scripts)
- `EXPO_PUBLIC_DEFAULT_PERMISSION_MODE`: Default Claude permission mode
- `EXPO_PUBLIC_PREVIEW_HOST`: Custom preview host for port-to-port access

---

## API Reference

### Socket Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `submit-prompt` | `{ prompt, provider?, permissionMode?, allowedTools?, approvalMode?, askForApproval?, fullAuto?, yolo? }` | Start AI session (Claude, Gemini, or Codex) |
| `input` | `string` | Send input to Claude |
| `resize` | `{ cols, rows }` | Resize PTY |
| `claude-terminate` | — | Kill Claude process |
| `run-render-command` | `{ command, url? }` | Execute command in new terminal |
| `run-render-write` | `{ terminalId, data }` | Write to terminal stdin |
| `run-render-terminate` | `{ terminalId }` | Kill terminal process |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `output` | `string` | AI output stream |
| `session-started` | `{ provider, permissionMode, allowedTools, useContinue, approvalMode? }` | Session started |
| `exit` | `{ exitCode }` | Session ended |
| `run-render-started` | `{ terminalId, pid? }` | Terminal created |
| `run-render-stdout` | `{ terminalId, chunk }` | Terminal stdout |
| `run-render-stderr` | `{ terminalId, chunk }` | Terminal stderr |
| `run-render-exit` | `{ terminalId, code, signal }` | Terminal exited |

### REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/config` | Server configuration |
| `GET /api/workspace-path` | Current workspace path |
| `GET /api/workspace-tree` | File tree JSON |
| `GET /api/workspace-file?path=...` | File content |
| `GET /api/preview-raw?path=...` | Raw file for preview |

---

## Development

### Project Scripts

```bash
# Server
npm start              # Start server
npm run dev            # Start with nodemon

# Mobile
npm run dev:mobile     # Start Expo with local server
npm run dev:mobile:cloudflare   # Start with Cloudflare tunnel URL

# Other
npm run icons:convert  # Convert icons
```

### Adding Features

**New AI Provider:**

1. Add config in `server/process/<provider>.js`
2. For PTY providers, register in `server/process/index.js` (`PTY_PROVIDER_CONFIG`)
3. For non-PTY providers (e.g. Codex app-server), add a session module and wire it in `createProcessManager`

**New AI Event Handler (mobile):**

1. Add handler in `apps/mobile/src/services/providers/<provider>/`
2. Register in provider event dispatcher

**New API Route:**

1. Add route in `server/routes/index.js`

**New Mobile Component:**

1. Place in appropriate `apps/mobile/src/components/` subdirectory
2. Import types from `apps/mobile/src/core/types`

---

## Troubleshooting

### Mobile can't connect to server

- Ensure server is running and accessible
- Check firewall settings
- For tunnel: ensure proxy is running (e.g. `npm run proxy`) when using Cloudflare

### Pi not found

Ensure Pi coding agent is installed and in PATH:

```bash
npm i -g @mariozechner/pi-coding-agent
which pi && pi --version
# Run pi and /login once to authenticate
```

### No API key found for google

When using Pi with the default provider (pi/gemini), Pi needs Google/Gemini credentials. The server loads auth from `workspace/.pi/agent/auth.json` or `project-root/.pi/agent/auth.json`; if neither exists, Pi uses `~/.pi/agent/auth.json`. Choose one:

**Option A – OAuth (no API key):**

1. Run `pi` in a terminal.
2. Type `/login`, select **Google Gemini CLI** or **Antigravity**.
3. Complete sign-in. Credentials are stored in `~/.pi/agent/auth.json` or project `.pi/agent/auth.json`.

**Option B – API key:**

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Add to `.env` (copy from `.env.example`): `GEMINI_API_KEY=your-key`
3. Restart the server.

The server loads `.env` automatically via dotenv.

### Port already in use

Kill process on port 3456 or use different port:

```bash
PORT=3457 npm start
```

---

## Documentation

- [Quick Start](docs/QUICKSTART.md) - Get running in 5 minutes
- [Architecture](docs/ARCHITECTURE.md) - System design and patterns
- [API Reference](docs/API.md) - Complete API documentation
- [Development](docs/DEVELOPMENT.md) - Development workflows
- [Deployment](docs/DEPLOYMENT.md) - Production deployment guide

## License

Private - For internal use only.
