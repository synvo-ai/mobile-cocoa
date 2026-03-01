# Server Config Module

> **Path:** [`server/config/index.js`](file:///Users/yifanxu/machine_learning/LoVC/vibe-coding-everywhere_v3/server/config/index.js)

## Function

Centralizes all server configuration: environment variables, workspace resolution, logging paths, external config loading (models, Pi, skills), and overlay/tunnel settings.

## Workflow

1. On import, resolves workspace directory from CLI args or env vars
2. Loads external JSON configs (`config/models.json`, `config/pi.json`, `config/skills.json`) from disk on demand
3. Creates log directories for LLM CLI I/O debug traces
4. Exports constants and getter/setter functions consumed by all other server modules

## Key Functions

| Function | Description |
|----------|-------------|
| `loadModelsConfig()` | Reads `config/models.json` — provider model lists, aliases. Falls back to built-in defaults |
| `loadPiConfig()` | Reads `config/pi.json` — Pi CLI path, provider mapping, routing rules, system prompts |
| `loadSkillsConfig()` | Reads `config/skills.json` — skill library dir, categories, enabled file path |
| `resolveWorkspaceCwd()` | Resolves workspace from `--workspace` flag → positional arg → `WORKSPACE` env → `WORKSPACE_CWD` env → default |
| `getWorkspaceCwd()` | Returns current workspace directory (mutable at runtime) |
| `setWorkspaceCwd(path)` | Changes workspace at runtime. Must be under `WORKSPACE_ALLOWED_ROOT` |
| `resolveLogDir()` | Creates and returns log directory path |
| `ensureLlmCliIoRunDir()` | Creates timestamped run directory for LLM I/O logs |
| `getLlmCliIoTurnPaths(provider, sessionId, turnId)` | Returns `{ inputPath, outputPath, turnDir }` for a conversation turn |
| `getOverlayNetwork()` | Returns `"tunnel"` or `"none"` based on `OVERLAY_NETWORK` env |

## How to Use

```js
import {
  PORT, getWorkspaceCwd, setWorkspaceCwd,
  loadModelsConfig, loadPiConfig, loadSkillsConfig,
  getLlmCliIoTurnPaths, ensureLlmCliIoRunDir,
} from "./server/config/index.js";

// Get current workspace
const cwd = getWorkspaceCwd();

// Load model config (re-reads from disk each call)
const models = loadModelsConfig();
console.log(models.providers.gemini.defaultModel);

// Change workspace at runtime
const result = setWorkspaceCwd("/Users/yifanxu/projects/my-app");
if (!result.ok) console.error(result.error);
```

## How to Test

No dedicated test file exists. Verify by:

```bash
# Start server and check config endpoint
npm start
curl http://localhost:3456/api/config
curl http://localhost:3456/api/models
curl http://localhost:3456/api/workspace-path
```

## API (Exported Constants)

| Export | Type | Description |
|--------|------|-------------|
| `PORT` | `number` | Server port (default `3456`) |
| `WORKSPACE_CWD` | `string` | Initial workspace directory |
| `WORKSPACE_ALLOWED_ROOT` | `string` | Root path for allowed workspace switching |
| `SIDEBAR_REFRESH_INTERVAL_MS` | `number` | File tree refresh interval (default `3000`) |
| `DEFAULT_PROVIDER` | `string` | Default AI provider (`gemini`) |
| `DEFAULT_PERMISSION_MODE` | `string` | Claude permission mode (`bypassPermissions`) |
| `ENABLE_DOCKER_MANAGER` | `boolean` | Docker management flag |
| `PI_CLI_PATH` | `string` | Path to Pi CLI binary |
| `SESSIONS_ROOT` | `string` | Root directory for session files |
| `MODELS_CONFIG_PATH` | `string` | Path to `config/models.json` |
| `PI_CONFIG_PATH` | `string` | Path to `config/pi.json` |
| `SKILLS_CONFIG_PATH` | `string` | Path to `config/skills.json` |
| `LLM_CLI_IO_LOG_DIR` | `string` | Base dir for LLM CLI I/O logs |
| `LLM_CLI_IO_RUN_DIR` | `string` | Timestamped run dir for current server session |
| `TUNNEL_PROXY_PORT` | `number` | Dev proxy port (default `9443`) |
| `projectRoot` | `string` | Absolute path to project root |
