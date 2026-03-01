/**
 * Process management for AI provider via Pi RPC (pi-mono).
 * Supports Claude, Gemini, and Codex through the unified Pi coding agent.
 */
import {
  DEFAULT_PROVIDER,
  DEFAULT_PROVIDER_MODELS,
  DEFAULT_SSE_HOST,
  getWorkspaceCwd,
  loadModelsConfig,
  projectRoot,
  VALID_PROVIDERS,
} from "../config/index.js";

import { createPiRpcSession } from "./piRpcSession.js";

const globalSpawnChildren = new Set();

export function shutdown() {
  for (const child of globalSpawnChildren) {
    try {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (_) { }
      }
      child.kill();
    } catch (_) { }
  }
  globalSpawnChildren.clear();
  process.exit(0);
}

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
    const modelsConfig = loadModelsConfig();
    return modelsConfig.providers?.[provider]?.defaultModel ?? getBuiltinDefaultModel(provider);
  } catch (_) {
    return getBuiltinDefaultModel(provider);
  }
}

function getBuiltinDefaultModel(provider) {
  return DEFAULT_PROVIDER_MODELS?.[provider] || provider;
}

function emitError(socket, message) {
  socket.emit("output", `\r\n\x1b[31m[Error] ${message}\x1b[0m\r\n`);
}

/** Format current time as yyyy-MM-dd_HH-mm-ss (24-hour) for log directory names. */
export function formatSessionLogTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Creates an AI process manager for a socket connection.
 * Uses Pi RPC for all providers (claude, gemini, codex).
 */
export function createProcessManager(socket, { hasCompletedFirstRunRef, sessionManagement, onPiSessionId, existingSessionPath, sessionId }) {
  const piRpcSession = createPiRpcSession({
    socket,
    hasCompletedFirstRunRef,
    sessionManagement,
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
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";

    if (!prompt) {
      emitError(socket, "Prompt cannot be empty.");
      return;
    }

    const provider = resolveProvider(payload?.provider);

    const defaultModel = getDefaultModelForProvider(provider);
    const model =
      typeof payload?.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : defaultModel;

    if (
      sessionManagement &&
      (sessionManagement.provider !== provider || sessionManagement.model !== model)
    ) {
      sessionManagement.sessionId = null;
      sessionManagement.sessionLogTimestamp = null;
      sessionManagement.provider = provider;
      sessionManagement.model = model;
      hasCompletedFirstRunRef.value = false;
    }

    if (sessionManagement && !sessionManagement.sessionLogTimestamp) {
      sessionManagement.sessionLogTimestamp = formatSessionLogTimestamp();
    }

    if (sessionManagement) {
      sessionManagement.provider = provider;
      sessionManagement.model = model;
    }

    piRpcSession.startTurn({ prompt, clientProvider: provider, model }).catch((err) => {
      emitError(socket, err?.message || "Failed to start Pi RPC.");
      socket.emit("exit", { exitCode: 1 });
    });
  }

  function handleInput(data) {
    piRpcSession.handleInput(data);
  }

  function handleTerminate(payload) {
    const resetSession = !!payload?.resetSession;
    if (resetSession && sessionManagement) {
      hasCompletedFirstRunRef.value = false;
      sessionManagement.sessionId = null;
      sessionManagement.sessionLogTimestamp = null;
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
  };
}

/**
 * Creates a socket-like adapter that broadcasts to session.subscribers (SSE responses).
 * Used by the REST+SSE session flow instead of Socket.IO.
 */
function createSseSocketAdapter(sessionId, session, host = DEFAULT_SSE_HOST) {
  const adapter = {
    id: sessionId,
    handshake: {
      headers: { host },
      address: "",
    },
    conn: { remoteAddress: "" },
    emit(event, data) {
      const subscribers = session.subscribers;
      if (!subscribers || subscribers.size === 0) return;
      const line = typeof data === "string" ? data : JSON.stringify(data);
      const sseData = line.replace(/\r?\n/g, "\ndata: ");
      const payload = `data: ${sseData}\n\n`;
      const endPayload = event === "exit"
        ? `event: end\ndata: ${JSON.stringify(data ?? {})}\n\n`
        : null;
      for (const response of subscribers) {
        try {
          if (response.writableEnded) continue;
          if (endPayload) {
            response.write(endPayload);
            response.end();
          } else {
            response.write(payload);
          }
        } catch (_) { }
      }
    },
    setHost(hostValue) {
      adapter.handshake.headers.host = hostValue || DEFAULT_SSE_HOST;
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
    sessionId: null,
    sessionLogTimestamp: sessionLogTimestamp ?? session.sessionLogTimestamp,
  };
  const socket = createSseSocketAdapter(sessionId, session);
  const processManager = createProcessManager(socket, {
    hasCompletedFirstRunRef,
    sessionManagement,
    onPiSessionId,
    existingSessionPath,
    sessionId,
  });
  const originalHandleSubmitPrompt = processManager.handleSubmitPrompt;
  processManager.handleSubmitPrompt = (payload, host) => {
    if (host) socket.setHost(host);
    originalHandleSubmitPrompt(payload);
  };
  return processManager;
}
