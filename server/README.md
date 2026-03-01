# Server Module Structure

This directory contains the refactored server code, organized into modular components for better maintainability. Uses Pi (pi-mono) as the unified AI coding agent for Claude, Gemini, and Codex.

## Directory Structure

```
server/
├── config/         # Configuration and environment variables
│   └── index.js    # PORT, WORKSPACE_CWD, DEFAULT_PROVIDER, etc.
├── utils/          # Utility functions
│   └── index.js    # stripAnsi, killProcessOnPort, buildWorkspaceTree, etc.
├── process/        # AI provider management (Pi RPC)
│   ├── index.js    # createProcessManager, shutdown
│   └── piRpcSession.js   # Pi RPC session (unified for claude/gemini/codex)
├── routes/         # Express routes
│   └── index.js    # API endpoints (/api/config, /api/workspace-tree, etc.)
└── socket/         # Socket.IO handlers
    └── index.js    # Real-time communication handlers
```

## Main Entry Point

The main `server.js` file in the project root imports from these modules:

```javascript
import { PORT } from "./server/config/index.js";
import { shutdown } from "./server/process/index.js";
import { setupRoutes } from "./server/routes/index.js";
import { setupSocketHandlers } from "./server/socket/index.js";
```

## Adding New Features

1. **New API routes**: Add to `server/routes/index.js`
2. **New Socket events**: Add to `server/socket/index.js`
3. **New AI provider via Pi**: Edit `config/pi.json` (provider mapping, routing rules, default models)
4. **New/changed models**: Edit `config/models.json`
5. **Skills configuration**: Edit `config/skills.json` (library path, categories, enabled-file path)
6. **New utilities**: Add to appropriate module or create new module
7. **New configuration**: Add to `server/config/index.js`
