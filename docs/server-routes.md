# Server Routes Module

> **Path:** [`server/routes/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/)

## Function

All Express HTTP endpoints, organized as separate route modules wired together by `setupRoutes()`.

## Workflow

1. `server/server.js` calls `setupRoutes(app)`
2. `setupRoutes()` registers all route modules in order
3. A catch-all `app.get("*")` serves workspace files for non-API paths
4. API logging middleware logs all `/api/` requests with timestamps

---

## Route Modules

### Config Routes — [`config.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/config.js)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Server config (sidebar refresh interval) |
| `/api/models` | GET | Model configuration from `config/models.json` (re-reads from disk) |
| `/api/workspace-path` | GET | Current workspace path + allowed root |
| `/api/workspace-path` | POST | Change workspace at runtime. Body: `{ path: "/new/path" }` |
| `/api/health` | GET | Health check with system info (memory, load, uptime) |

---

### Sessions Routes — [`sessions.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/sessions.js)

The largest route module. Manages AI session lifecycle via REST+SSE.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all sessions (from disk + in-memory registry) |
| `/api/sessions` | POST | Create a new session. Body: `{ provider, model, cwd? }` |
| `/api/sessions/:id` | GET | Get session details |
| `/api/sessions/:id` | DELETE | Delete a session |
| `/api/sessions/:id/prompt` | POST | Submit prompt to session. Body: `{ prompt, provider?, model? }` |
| `/api/sessions/:id/input` | POST | Send input (approval) to running session |
| `/api/sessions/:id/terminate` | POST | Kill the running AI process |
| `/api/sessions/:id/stream` | GET | SSE stream — subscribes to real-time session output |
| `/api/sessions/:id/replay` | GET | Replay full session JSONL as SSE events |
| `/api/sessions/:id/messages` | GET | Parsed messages from session JSONL |

---

### Workspace Routes — [`workspace.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/workspace.js)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workspace-tree` | GET | File tree JSON (recursive, excludes `node_modules`, `.git`, etc.) |
| `/api/workspace-file?path=...` | GET | File content (text or base64 for images, max 500KB) |
| `/api/preview-raw?path=...` | GET | Raw file with MIME type (for preview iframe) |
| `/api/workspace-allowed-children?path=...` | GET | List directories under allowed root |
| `/api/workspace-create-folder` | POST | Create a new folder. Body: `{ path }` |

---

### Git Routes — [`git.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/git.js)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/git/commits?limit=N` | GET | Recent commits (default 50) |
| `/api/git/tree?path=...` | GET | File tree with last commit annotation |
| `/api/git/status` | GET | Staged, unstaged, untracked files |
| `/api/git/diff?file=...&staged=true` | GET | Git diff output |
| `/api/git/action` | POST | Git actions: `stage`, `commit`, `push`, `init` |

---

### Docker Routes — [`docker.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/docker.js)

Enabled only when `ENABLE_DOCKER_MANAGER` is set.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/docker/status` | GET | Whether Docker management is enabled |
| `/api/docker/diagnostic` | GET | Docker socket diagnostic info |
| `/api/docker/containers?all=true` | GET | List containers |
| `/api/docker/containers/:id/start` | POST | Start container |
| `/api/docker/containers/:id/stop` | POST | Stop container |
| `/api/docker/containers/:id/restart` | POST | Restart container |
| `/api/docker/containers/:id` | DELETE | Remove container |
| `/api/docker/containers/:id/logs?tail=N` | GET | Container logs |
| `/api/docker/images` | GET | List images |
| `/api/docker/images/:id` | DELETE | Remove image |
| `/api/docker/images/prune` | POST | Prune unused images |
| `/api/docker/volumes` | GET | List volumes |
| `/api/docker/volumes/:name` | DELETE | Remove volume |
| `/api/docker/volumes/prune` | POST | Prune unused volumes |

---

### Skills Routes — [`skills.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/skills.js)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/skills` | GET | Discover all skills in the skills library |
| `/api/skills/:id` | GET | Get skill content (SKILL.md) |
| `/api/skills/:id/children?path=...` | GET | Browse skill subdirectories |
| `/api/skills-enabled` | GET | List enabled skill IDs for current workspace |
| `/api/skills-enabled` | POST | Update enabled skills. Body: `{ enabledIds: [...] }` |

---

### Process Routes — [`processes.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/processes.js)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/processes` | GET | List processes on common dev ports |
| `/api/processes/log?path=...&name=...&lines=N` | GET | Tail a log file |
| `/api/processes/:pid/kill` | POST | Kill a process (protected PIDs blocked) |

---

### Health Page Routes — [`healthPage.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/healthPage.js)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Serves health check HTML page |
| `/health-check` | GET | Alias for `/health` |

---

### Session Management Store — [`sessionManagementStore.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/sessionManagementStore.js)

In-memory store for session management snapshots (posted by mobile client).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/session-management-store` | GET | Get latest snapshot |
| `/api/session-management-store` | POST | Update snapshot. Body: any JSON object |

---

## How to Use

All routes are auto-registered. Just start the server:

```bash
npm start
# or
npm run dev
```

Then call any endpoint:

```bash
curl http://localhost:3456/api/config
curl http://localhost:3456/api/sessions
curl -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' \
  -d '{"provider":"gemini","model":"gemini-3.1-pro-preview"}'
```

## How to Test

```bash
# Smoke test (session lifecycle over SSE)
RAPID_MODE=1 node scripts/smoke-pi-rpc-sse-session-switch.mjs

# Session folder structure test
node scripts/smoke-session-folder.mjs

# Manual: curl endpoints as shown above
```
