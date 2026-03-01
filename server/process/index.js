/**
 * Process management for AI provider via Pi RPC (pi-mono).
 * Supports Claude, Gemini, and Codex through the unified Pi coding agent.
 */
import {
  DEFAULT_PERMISSION_MODE,
  DEFAULT_PROVIDER, getWorkspaceCwd,
  loadModelsConfig,
  projectRoot
} from "../config/index.js";

import { createPiRpcSession } from "./piRpcSession.js";

export const globalSpawnChildren = new Set();

export function shutdown(signal) {
  for (const c of globalSpawnChildren) {
    try {
      if (process.platform !== "win32" && c.pid) {
        try {
          process.kill(-c.pid, "SIGTERM");
        } catch (_) { }
      }
      c.kill();
    } catch (_) { }
  }
  globalSpawnChildren.clear();
  process.exit(0);
}

const VALID_PROVIDERS = ["codex", "gemini", "claude"];

function resolveProvider(fromPayload) {
  if (typeof fromPayload === "string" && VALID_PROVIDERS.includes(fromPayload)) {
    return fromPayload;
  }
  return DEFAULT_PROVIDER;
}

/**
 * Return the default model for a given provider by reading config/models.json.
 * Falls back to hardcoded safe values when the provider is missing from config.
 */
function getDefaultModelForProvider(provider) {
  try {
    const cfg = loadModelsConfig();
    return cfg.providers?.[provider]?.defaultModel ?? _builtinDefaultModel(provider);
  } catch (_) {
    return _builtinDefaultModel(provider);
  }
}

function _builtinDefaultModel(provider) {
  if (provider === "claude") return "sonnet4.5";
  if (provider === "codex") return "gpt-5.1-codex-mini";
  return "gemini-3.1-pro-preview";
}

function emitError(socket, message) {
  socket.emit("output", `\r\n\x1b[31m[Error] ${message}\x1b[0m\r\n`);
}

function safeStringify(value, space = 0) {
  try {
    return JSON.stringify(value, null, space);
  } catch (_) {
    const seen = new WeakSet();
    try {
      return JSON.stringify(
        value,
        (_, nested) => {
          if (typeof nested === "object" && nested !== null) {
            if (seen.has(nested)) return "[Circular]";
            seen.add(nested);
          }
          return nested;
        },
        space
      );
    } catch (_) {
      return "[Unserializable payload]";
    }
  }
}

/** Format current time as yyyy-MM-dd_HH-mm-ss (24-hour) for log directory names. */
export function formatSessionLogTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Creates an AI process manager for a socket connection.
 * Uses Pi RPC for all providers (claude, gemini, codex).
 */
export function createProcessManager(socket, { hasCompletedFirstRunRef, session_management, onPiSessionId, existingSessionPath, sessionId }) {
  let turnCounter = 0;
  const piRpcSession = createPiRpcSession({
    socket,
    hasCompletedFirstRunRef,
    sessionManagement: session_management,
    globalSpawnChildren,
    getWorkspaceCwd,
    projectRoot,
    onPiSessionId,
    existingSessionPath,
    sessionId,
  });

  function processRunning() {
    return piRpcSession.isTurnRunning();
  }

  function handleSubmitPrompt(payload) {
    console.log("[submit-prompt] full input:", safeStringify(payload, 2));
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";

    if (!prompt) {
      emitError(socket, "Prompt cannot be empty.");
      return;
    }

    const provider = resolveProvider(payload?.provider);
    console.log("[submit-prompt] chat input (user prompt):", prompt, "provider:", provider);

    const defaultModel = getDefaultModelForProvider(provider);
    const model =
      typeof payload?.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : defaultModel;

    if (
      session_management &&
      (session_management.provider !== provider || session_management.model !== model)
    ) {
      session_management.session_id = null;
      session_management.session_log_timestamp = null;
      session_management.provider = provider;
      session_management.model = model;
      hasCompletedFirstRunRef.value = false;
    }

    turnCounter += 1;
    if (session_management && !session_management.session_log_timestamp) {
      session_management.session_log_timestamp = formatSessionLogTimestamp();
    }
    const conversationSessionId = socket.id ?? "unknown";

    const options = {
      model,
      clientProvider: provider,
      permissionMode: DEFAULT_PERMISSION_MODE || null,
      allowedTools: [],
      useContinue: hasCompletedFirstRunRef.value,
      hasCompletedFirstRunRef,
      sessionLogTimestamp: session_management?.session_log_timestamp ?? undefined,
      conversationSessionId,
      turnId: turnCounter,
    };

    if (session_management) {
      session_management.provider = provider;
      session_management.model = model;
    }

    piRpcSession.startTurn({ prompt, options }).catch((err) => {
      emitError(socket, err?.message || "Failed to start Pi RPC.");
      socket.emit("exit", { exitCode: 1 });
    });
  }

  function handleInput(data) {
    console.log(
      "[input] chat input (user reply):",
      typeof data === "string" ? data.replace(/\r$/, "") : JSON.stringify(data)
    );
    piRpcSession.handleInput(data);
  }


  function handleTerminate(payload) {
    const resetSession = !!payload?.resetSession;
    if (resetSession && session_management) {
      hasCompletedFirstRunRef.value = false;
      session_management.session_id = null;
      session_management.session_log_timestamp = null;
    }
    piRpcSession.close();
    socket.emit("exit", { exitCode: 0 });
  }


  function cleanup() {
    piRpcSession.close();
  }

  return {
    processRunning,
    handleSubmitPrompt,
    handleInput,
    handleTerminate,
    cleanup,
    getTurnCounter: () => turnCounter,
  };
}

/**
 * Creates a socket-like adapter that broadcasts to session.subscribers (SSE responses).
 * Used by the REST+SSE session flow instead of Socket.IO.
 */
function createSseSocketAdapter(sessionId, session, host = "localhost:3456") {
  const adapter = {
    id: sessionId,
    handshake: {
      headers: { host },
      address: "",
    },
    conn: { remoteAddress: "" },
    emit(event, data) {
      const subs = session.subscribers;
      if (!subs || subs.size === 0) return;
      const line = typeof data === "string" ? data : JSON.stringify(data);
      const sseData = line.replace(/\r?\n/g, "\ndata: ");
      const payload = `data: ${sseData}\n\n`;
      const endPayload = event === "exit"
        ? `event: end\ndata: ${JSON.stringify(data ?? {})}\n\n`
        : null;
      for (const res of subs) {
        try {
          if (res.writableEnded) continue;
          if (endPayload) {
            res.write(endPayload);
            res.end();
          } else {
            res.write(payload);
          }
        } catch (_) { }
      }
    },
    setHost(h) {
      adapter.handshake.headers.host = h || "localhost:3456";
    },
  };
  return adapter;
}

/**
 * Creates a process manager for the REST+SSE session flow.
 * Uses one Pi RPC process per session; output is broadcast to all SSE subscribers.
 */
export function createSessionProcessManager(sessionId, session, { onPiSessionId, existingSessionPath, sessionLogTimestamp } = {}) {
  const hasCompletedFirstRunRef = { value: false };
  const sessionManagement = {
    provider: session.provider,
    model: session.model,
    session_id: null,
    session_log_timestamp: sessionLogTimestamp ?? session.sessionLogTimestamp,
  };
  const socket = createSseSocketAdapter(sessionId, session);
  const pm = createProcessManager(socket, {
    hasCompletedFirstRunRef,
    session_management: sessionManagement,
    onPiSessionId,
    existingSessionPath,
    sessionId,
  });
  const origHandleSubmitPrompt = pm.handleSubmitPrompt;
  pm.handleSubmitPrompt = (payload, host) => {
    if (host) socket.setHost(host);
    origHandleSubmitPrompt(payload);
  };
  return pm;
}
