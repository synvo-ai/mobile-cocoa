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
| `/api/health` | GET | Health JSON with system info (memory, load, uptime) |

---

### Sessions Routes — [`sessions.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/sessions.js)

Manages AI session lifecycle via REST+SSE.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions/status` | GET | Session status list for client UI |
| `/api/sessions/new` | POST | Create a new empty session and return `{ sessionId }` |
| `/api/sessions` | GET | List discovered sessions from disk and active registry |
| `/api/sessions` | POST | Submit a prompt and create/reuse a session |
| `/api/sessions/destroy-workspace` | POST | Delete all session folders belonging to a workspace |
| `/api/sessions/:sessionId/input` | POST | Send pending interactive input to a running session |
| `/api/sessions/:sessionId/terminate` | POST | Terminate running AI process for a session |
| `/api/sessions/:sessionId/finished` | POST | Compatibility no-op completion endpoint |
| `/api/sessions/:sessionId/messages` | GET | Parse and return messages from session JSONL |
| `/api/sessions/:sessionId/stream` | GET | SSE stream (with optional replay behavior) |
| `/api/sessions/:sessionId` | DELETE | Delete session folder and cleanup active process/subscribers |

---

### Workspace Routes — [`workspace.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/routes/workspace.js)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workspace-tree` | GET | File tree JSON (recursive, excludes `node_modules`, `.git`, etc.) |
| `/api/workspace-file?path=...` | GET | File content (text or base64 for images, max 500KB) |
| `/api/preview-raw?path=...` | GET | Raw file with MIME type (for preview iframe) |
| `/api/workspace-allowed-children?path=...` | GET | List directories under allowed root |
| `/api/workspace/create-folder` | POST | Create a new folder. Body: `{ base?, root?, parent?, name }` |

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
| `/docker` | GET | Docker dashboard HTML |
| `/docker.js` | GET | Docker dashboard JS |
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

**Related work log**: [Add Skill (Discover, Install, Create) UI + API (March 3)](./march3/skill-discovery-install-create-ui.md)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/skills` | GET | Discover all skills in the skills library |
| `/api/skills/search` | GET | Search remote discoverable skills by `q` and `source` |
| `/api/skills/sources` | GET | List enabled install/search sources and their status |
| `/api/skills/:id` | GET | Get skill content (`SKILL.md`) |
| `/api/skills/:id/children?path=...` | GET | Browse skill subdirectories |
| `/api/skills/install` | POST | Install a skill from `find-skills` catalog or a GitHub URL |
| `/api/skills/create` | POST | Create a local skill scaffold |
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
| `/health-check.js` | GET | Health dashboard script |

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
curl -X POST http://localhost:3456/api/sessions/new
```

## How to Test

```bash
# Smoke test
npm run smoke:server

# Regression tests (sessions/routes/process guards)
node --test ./server/tests/regression-fixes.test.mjs

# Manual: curl endpoints as shown above
```
