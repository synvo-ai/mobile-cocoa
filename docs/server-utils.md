# Server Utils Module

> **Path:** [`server/utils/`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/utils/)

## Function

Shared utility functions used across the server: preview/overlay resolution, workspace file tree building, path security, MIME types, git operations, and process discovery.

---

## Files

### [`index.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/utils/index.js) — Core Utilities

| Function | Description |
|----------|-------------|
| `getPreviewHost()` | Resolves preview host for system prompt injection. Priority: `PREVIEW_HOST` env → tunnel proxy marker → `"(not set)"` |
| `getActiveOverlay()` | Returns `"tunnel"` or `"none"` |
| `killProcessOnPort(port)` | Kills any process on a port (via `lsof`/`kill`) |
| `buildWorkspaceTree(dirPath, basePath)` | Recursive directory listing as JSON tree. Skips `node_modules`, `.git`, `dist`, etc. |
| `IMAGE_EXT` | Set of image extensions |
| `MAX_TEXT_FILE_BYTES` | 500KB limit for file viewer |

### [`pathHelpers.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/utils/pathHelpers.js) — Path Security

| Function | Description |
|----------|-------------|
| `normalizeRelativePath(relPath)` | Strips directory traversal (`../`) and normalizes |
| `resolveWithinRoot(rootDir, relativePath)` | Checks path stays within root. Returns `{ ok, fullPath, error }` |
| `getMimeForFile(filename)` | Maps extension to MIME type (html, css, js) |

### [`git.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/utils/git.js) — Git Operations

| Function | Description |
|----------|-------------|
| `getGitCommits(cwd, limit)` | Recent commits with hash, author, date, message |
| `getGitTree(cwd, dirPath)` | Files annotated with last commit info |
| `getGitStatus(cwd)` | Staged, unstaged, untracked files from `git status --porcelain` |
| `gitAdd(cwd, files)` | Stage files |
| `gitCommit(cwd, message)` | Create commit |
| `gitPush(cwd)` | Push to remote |
| `gitInit(cwd)` | Initialize new repo |

### [`processes.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/utils/processes.js) — Process Discovery

| Function | Description |
|----------|-------------|
| `listProcessesOnPorts(workspacePath)` | Finds processes on dev ports (3000–9999) via `lsof`/`ps` |
| `killProcess(pid)` | Sends SIGTERM to a process |
| `isProtectedPid(pid)` | Checks if PID is on a protected port |
| `getLogFilesFromProcess(pid)` | Extracts log file paths from process fd via `lsof` |
| `getLogTail(absPath, workspacePath, lines)` | Reads last N lines of a log file |
| `getLogTailByName(workspacePath, name, lines)` | Finds log by filename and returns tail |
| `findLogFile(workspacePath, name)` | Searches workspace for a log file by name |

## How to Use

```js
import { buildWorkspaceTree, resolveWithinRoot } from "./server/utils/index.js";
import { getGitStatus, gitAdd, gitCommit } from "./server/utils/git.js";
import { listProcessesOnPorts, killProcess } from "./server/utils/processes.js";

// Build file tree
const tree = buildWorkspaceTree("/path/to/workspace");

// Validate path stays inside workspace
const { ok, fullPath } = resolveWithinRoot("/workspace", "../etc/passwd");
// ok = false

// Git operations
const status = getGitStatus("/workspace");
gitAdd("/workspace", ["src/index.js"]);
gitCommit("/workspace", "feat: add hello world");

// Process management
const procs = listProcessesOnPorts("/workspace");
killProcess(12345);
```

## How to Test

```bash
# Git utils can be tested in any git repo
node -e "
  import { getGitStatus } from './server/utils/git.js';
  console.log(getGitStatus('.'));
"

# Process utils
curl http://localhost:3456/api/processes
```

## API

All functions are exported as named exports from their respective files. Re-exported from `index.js` where applicable.
