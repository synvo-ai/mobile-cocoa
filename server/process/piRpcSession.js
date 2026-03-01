/**
 * Pi RPC session manager.
 *
 * Spawns `pi --mode rpc` and forwards events to the socket.
 * Uses native Pi RPC protocol; extension_ui_request is transformed to AskUserQuestion
 * for compatibility with the client's approval modal.
 */
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  DEFAULT_PROVIDER_MODEL_ALIASES,
  DEFAULT_PROVIDER,
  DEFAULT_SERVER_HOST,
  LOOPBACK_HOSTS,
  PI_CLI_PATH, PORT,
  SESSIONS_ROOT,
  PI_SYSTEM_PROMPT_TERMINAL_RULES,
  loadModelsConfig,
  loadPiConfig,
  loadSkillsConfig,
  PI_FALLBACK_MODEL,
  PI_PROVIDER_FALLBACK,
} from "../config/index.js";
import { resolveAgentDir, syncEnabledSkillsFolder } from "../skills/index.js";
import { getActiveOverlay, getPreviewHost } from "../utils/index.js";

/** Byte threshold above which assistant message SSE events are stripped to prevent unbounded responseText growth. */
const SLIM_SSE_THRESHOLD_BYTES = 2048;

function isLoopbackHost(rawHost) {
  const host = String(rawHost || "").toLowerCase();
  if (!host) return false;
  if (LOOPBACK_HOSTS.length === 0) return false;
  return LOOPBACK_HOSTS.some(
    (alias) =>
      host === alias || host.startsWith(`${alias}:`) || host === `[${alias}]` || host.startsWith(`[${alias}]:`),
  );
}

/** Map client short model names to Pi CLI model IDs, loaded from config/models.json. */
function toPiModel(clientModel, piProvider) {
  if (piProvider !== "anthropic" || !clientModel) return clientModel;
  try {
    const modelsConfig = loadModelsConfig();
    const aliases = modelsConfig.modelAliases ?? DEFAULT_PROVIDER_MODEL_ALIASES;
    return aliases[clientModel] ?? clientModel;
  } catch (_) {
    return DEFAULT_PROVIDER_MODEL_ALIASES[clientModel] ?? clientModel;
  }
}

/**
 * Extract hostname the client used to connect (from Host header).
 * This is the remote_host for terminal-runner and preview URLs.
 * @param {import('socket.io').Socket} socket
 * @returns {string} hostname, or "" if unavailable
 */
function getRemoteHostFromSocket(socket) {
  const hostHeader = String(socket?.handshake?.headers?.host ?? "").trim();
  const host = hostHeader.split(":")[0]?.trim() ?? "";
  if (!host) return "";
  return isLoopbackHost(host) ? DEFAULT_SERVER_HOST : host;
}

/**
 * Derive connection context from socket for Pi agent awareness.
 * Supports tunnel (dev proxy, e.g. Cloudflare) and localhost connections.
 * @param {import('socket.io').Socket} socket
 * @returns {string} "local", "tunnel remote host", or "remote"
 */
function getConnectionContext(socket) {
  const addr = String(socket?.handshake?.address ?? socket?.conn?.remoteAddress ?? "");
  const host = String((socket?.handshake?.headers?.host ?? "").split(":")[0] ?? "");
  const isLocal = isLoopbackHost(addr) || isLoopbackHost(host);

  const overlay = getActiveOverlay();
  if (overlay === "tunnel") {
    const tunnelHeader = socket?.handshake?.headers?.["x-tunnel-proxy"];
    if (tunnelHeader) return "tunnel remote host";
    if (isLocal) return DEFAULT_SERVER_HOST;
    return "tunnel remote host";
  }

  if (isLocal) return DEFAULT_SERVER_HOST;
  return "remote";
}

/**
 * Map client provider + model to the Pi CLI --provider value.
 *
 * Pi CLI providers (from `pi --list-models`):
 *   - google-gemini-cli  → gemini-2.x, gemini-3.x-preview, gemini-3.1-*
 *   - google-antigravity  → gemini-3-pro-low, gemini-3-pro-high, gemini-3-flash
 *   - anthropic           → claude-*
 *   - openai              → gpt-*, codex-*
 */
function getPiProviderForModel(clientProvider, model) {
  const piConfig = loadPiConfig();
  const routing = piConfig.providerRouting ?? {};
  const rules = routing.rules ?? [];
  const fallback = routing.fallback ?? {};
  const providerMap = piConfig.providerMapping ?? {};
  const compileModelPattern = (pattern, context) => {
    if (!pattern) return null;
    try {
      return new RegExp(pattern);
    } catch (error) {
      console.warn(`Skipping invalid ${context} regex "${pattern}" in pi config`, error);
      return null;
    }
  };

  if (typeof model === "string") {
    // Evaluate routing rules in order; first match wins
    for (const rule of rules) {
      const matchPattern = compileModelPattern(rule.modelPattern, "modelPattern");
      if (!matchPattern || !matchPattern.test(model)) {
        continue;
      }
      const excludePattern = compileModelPattern(rule.excludePattern, "excludePattern");
      if (excludePattern && excludePattern.test(model)) {
        continue;
      }
      if (!rule.provider) {
        continue;
      }
      return rule.provider;
    }
  }

  // Fallback by client provider name
  if (fallback[clientProvider]) return fallback[clientProvider];
  if (providerMap[clientProvider]) return providerMap[clientProvider];
  return PI_PROVIDER_FALLBACK;
}

function parseAskQuestionAnswersFromInput(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const top = JSON.parse(raw);
    const content = top?.message?.content;
    if (!Array.isArray(content) || content.length === 0) return null;
    const first = content[0];
    const inner = typeof first?.content === "string" ? first.content : null;
    if (!inner) return null;
    const parsed = JSON.parse(inner);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function decideApprovalFromAnswers(answers, fallbackRaw) {
  const selected = Array.isArray(answers)
    ? answers.flatMap((a) => (Array.isArray(a?.selected) ? a.selected : []))
    : [];
  const normalized = selected.map((s) => String(s).trim().toLowerCase());
  const hasAccept = normalized.some((s) => /approve|accept|allow|run/.test(s));
  const hasDeny = normalized.some((s) => /deny|decline|reject|cancel|block/.test(s));
  if (hasAccept && !hasDeny) return true;
  if (hasDeny && !hasAccept) return false;
  const fallbackText = typeof fallbackRaw === "string" ? fallbackRaw.trim().toLowerCase() : "";
  if (["y", "yes", "approve", "accept", "allow", "run"].includes(fallbackText)) return true;
  if (["n", "no", "deny", "decline", "reject", "cancel", "block"].includes(fallbackText)) return false;
  return false;
}

/**
 * Transform Pi extension_ui_request to AskUserQuestion format for client modal.
 */
function toAskUserQuestionPayload(request) {
  const id = request.id;
  const method = request.method;
  const title = request.title ?? "Approval";
  const message = request.message ?? title;
  const options = request.options ?? ["Allow", "Deny"];

  const questions = [
    {
      header: String(title),
      question: String(message),
      options: options.map((o) => ({
        label: typeof o === "string" ? o : String(o?.label ?? o),
        description: typeof o === "object" && o != null ? o.description : undefined,
      })),
      multiSelect: false,
    },
  ];

  return {
    tool_name: "AskUserQuestion",
    tool_use_id: id,
    uuid: id,
    tool_input: { questions },
  };
}

export function createPiRpcSession({
  socket,
  hasCompletedFirstRunRef,
  sessionManagement,
  globalSpawnChildren,
  getWorkspaceCwd,
  projectRoot,
  onPiSessionId,
  existingSessionPath,
  sessionId,
}) {
  let piProcess = null;
  let stdoutBuffer = "";
  let turnRunning = false;
  let pendingExtensionUiRequest = null;
  /** Path to the JSONL session log. Set when a turn begins; cleared when it ends. */
  let piIoOutputPath = null;
  let turnCompleted = false;

  /** Append a single line to the JSONL log synchronously so it's on disk immediately. */
  function appendToSessionLog(data) {
    if (!piIoOutputPath) return;
    try {
      fs.appendFileSync(piIoOutputPath, data);
    } catch (_) { }
  }

  /** Emit full event to client; write slim event to log for message_update to avoid O(n²) growth. */
  function emitOutputLine(line) {
    socket.emit("output", line);
    if (!piIoOutputPath) return;
    const lineText = typeof line === "string" ? line : JSON.stringify(line);
    const trimmed = lineText.trimEnd();
    if (trimmed.startsWith('{"type":"message_update"')) {
      try {
        const parsed = JSON.parse(trimmed);
        const assistantMessageEvent = parsed.assistantMessageEvent ?? {};
        const slim = {
          type: "message_update",
          assistantMessageEvent: {
            type: assistantMessageEvent.type,
            contentIndex: assistantMessageEvent.contentIndex,
            delta: assistantMessageEvent.delta ?? assistantMessageEvent.content,
          },
        };
        appendToSessionLog(JSON.stringify(slim) + "\n");
      } catch {
        appendToSessionLog(lineText + (lineText.endsWith("\n") ? "" : "\n"));
      }
    } else {
      appendToSessionLog(lineText + (lineText.endsWith("\n") ? "" : "\n"));
    }
  }

  function closeIoOutputStream() {
    piIoOutputPath = null;
  }

  function openPiIoOutputStream() {
    if (!existingSessionPath || typeof existingSessionPath !== "string") return;
    try {
      fs.mkdirSync(path.dirname(existingSessionPath), { recursive: true });
    } catch (_) { }
    piIoOutputPath = existingSessionPath;
  }

  function signalTurnComplete(exitCode = 0, options = {}) {
    if (turnCompleted) return;
    turnCompleted = true;
    turnRunning = false;
    pendingExtensionUiRequest = null;
    if (options.markCompleted && exitCode === 0) {
      hasCompletedFirstRunRef.value = true;
    }
    closeIoOutputStream();
    socket.emit("exit", { exitCode: Number.isInteger(exitCode) ? exitCode : 0 });
  }

  function sendCommand(cmd) {
    if (!piProcess?.stdin?.writable) return;
    const line = JSON.stringify(cmd) + "\n";
    piProcess.stdin.write(line);
  }

  function terminateProcessTree(processHandle) {
    if (!processHandle) return;
    const pid = processHandle.pid;

    try {
      processHandle.stdin?.end();
    } catch (_) { }
    try {
      processHandle.kill("SIGTERM");
    } catch (_) { }
    if (!Number.isInteger(pid)) return;

    if (process.platform === "win32") {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      } catch (_) { }
      return;
    }

    if (process.platform !== "win32") {
      try {
        process.kill(-pid, "SIGTERM");
      } catch (_) { }
      try {
        processHandle.kill("SIGKILL");
      } catch (_) { }
      try {
        process.kill(-pid, "SIGKILL");
      } catch (_) { }
    }
  }

  function close() {
    closeIoOutputStream();
    pendingExtensionUiRequest = null;
    turnCompleted = true;
    if (!piProcess) return;
    globalSpawnChildren.delete(piProcess);
    terminateProcessTree(piProcess);
    piProcess = null;
    turnRunning = false;
  }

  /**
   * Strip heavy content from snapshot/lifecycle events before forwarding to SSE clients.
   * Events like message_end, turn_end, agent_end carry the full message content (60KB+)
   * but the mobile client treats them as no-ops. Sending slim versions prevents
   * xhr.responseText from growing unboundedly, which causes RangeError in Hermes.
   * message_update events can carry full accumulated content; we only need type/delta.
   */
  function slimEventForSse(parsed) {
    const type = String(parsed.type ?? "");
    // These event types carry full message/content snapshots that the client ignores
    const HEAVY_TYPES = new Set(["message_end", "turn_end", "message_start"]);
    if (HEAVY_TYPES.has(type)) {
      return { type };
    }
    // agent_end carries all conversation messages — strip to just type
    if (type === "agent_end") {
      return { type: "agent_end" };
    }
    // message events with role: assistant may contain full content — strip if > 2KB
    if (type === "message" && parsed.message?.role === "assistant") {
      const serialized = JSON.stringify(parsed);
      if (serialized.length > SLIM_SSE_THRESHOLD_BYTES) {
        return { type: "message", id: parsed.id, parentId: parsed.parentId, timestamp: parsed.timestamp, message: { role: "assistant", content: "[content stripped for SSE]" } };
      }
    }
    // message_update: client only needs assistantMessageEvent.type, contentIndex, delta/content.
    // Pi can send full accumulated content; slimming prevents unbounded xhr.responseText growth.
    if (type === "message_update") {
      const assistantMessageEvent = parsed.assistantMessageEvent ?? {};
      return {
        type: "message_update",
        assistantMessageEvent: {
          type: assistantMessageEvent.type,
          contentIndex: assistantMessageEvent.contentIndex,
          delta: assistantMessageEvent.delta ?? assistantMessageEvent.content,
          ...(assistantMessageEvent.toolCall != null ? { toolCall: assistantMessageEvent.toolCall } : {}),
        },
      };
    }
    return parsed;
  }

  function handlePiEvent(parsed) {
    if (!parsed || typeof parsed !== "object") return;
    const type = String(parsed.type ?? "");

    // Forward most events as-is (native Pi RPC protocol)
    if (type === "extension_ui_request") {
      const method = parsed.method;
      // Dialog methods (select, confirm, input, editor) need user response
      if (["select", "confirm"].includes(method)) {
        // Auto-approve tool execution confirmations to prevent blocking when modal
        // is not shown or user cannot respond (e.g. terminal-runner bash approval).
        const piCfgForApprove = loadPiConfig();
        const autoApprove = piCfgForApprove.autoApproveToolConfirm === true || piCfgForApprove.autoApproveToolConfirm === 1;
        if (autoApprove && method === "confirm") {
          sendCommand({ type: "extension_ui_response", id: parsed.id, confirmed: true });
          return;
        }
        pendingExtensionUiRequest = { id: parsed.id, method, request: parsed };
        const askPayload = toAskUserQuestionPayload(parsed);
        emitOutputLine(JSON.stringify(askPayload) + "\n");
      }
      // Fire-and-forget methods (notify, setStatus, etc.) - no response needed
      return;
    }

    if (type === "session" && typeof parsed.id === "string" && onPiSessionId) {
      onPiSessionId(parsed.id);
    }

    if (type === "agent_start") {
      turnRunning = true;
    }

    if (type === "agent_end") {
      const context = {
        sessionId,
        provider: sessionManagement?.provider,
        model: sessionManagement?.model,
        turnRunning,
      };
      // Emit slim agent_end (no messages array) to avoid bloating SSE responseText
      const slimmed = slimEventForSse(parsed);
      emitOutputLine(JSON.stringify(slimmed) + "\n");
      signalTurnComplete(0, { markCompleted: true });
      return;
    }

    if (type === "response" && parsed.success === false) {
      const err = parsed.error ?? "Pi request failed";
      emitOutputLine(`\r\n\x1b[31m[Error] ${err}\x1b[0m\r\n`);
      if (parsed.command === "prompt") {
        signalTurnComplete(1);
      }
      return;
    }

    if (type === "extension_error") {
      const err = parsed.error ?? "Extension error";
      emitOutputLine(`\r\n\x1b[31m[Error] ${err}\x1b[0m\r\n`);
      return;
    }

    // Forward events to client, stripping heavy snapshot content
    const slimmed = slimEventForSse(parsed);
    emitOutputLine(JSON.stringify(slimmed) + "\n");
  }

  async function ensurePiProcess(options) {
    if (piProcess) return;

    const piProvider = getPiProviderForModel(options.clientProvider ?? DEFAULT_PROVIDER, options.model);
    const piCfg = loadPiConfig();
    const defaultModels = piCfg.defaultModels ?? {};

    // Validate that the requested model exists in the models config.
    // If the client sent a stale/cached model ID (e.g. deprecated "gemini-3-pro-high"),
    // fall back to the provider's default model.
    let rawModel = options.model ?? (defaultModels[piProvider] || PI_FALLBACK_MODEL);
    const modelsCfg = loadModelsConfig();
    const allKnownModels = Object.values(modelsCfg.providers ?? {}).flatMap(
      (p) => (p.models ?? []).map((m) => m.value)
    );
    if (rawModel && allKnownModels.length > 0 && !allKnownModels.includes(rawModel)) {
      const fallbackModel = defaultModels[piProvider] || PI_FALLBACK_MODEL;
      console.warn(`[pi] Unknown model "${rawModel}" — falling back to "${fallbackModel}"`);
      rawModel = fallbackModel;
    }

    const piModel = toPiModel(rawModel, piProvider);
    const cwd = getWorkspaceCwd();
    // Session dir = base sessions folder (sessions/). Pi expects this base; it creates
    // sessions/{sessionId}/ internally. Passing sessions/sessionId causes Pi to create
    // "sessions-{sessionId}" (path separators replaced by -) as a sibling folder.
    const sessionDir = path.join(SESSIONS_ROOT, "sessions");

    try {
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch (_) { }

    const terminalRules = piCfg.systemPrompts?.terminalRules || PI_SYSTEM_PROMPT_TERMINAL_RULES;
    const connectionType = getConnectionContext(socket);
    const previewHost = getPreviewHost();
    const overlay = getActiveOverlay();

    // Build overlay-specific hint for preview URLs
    let overlayHint = "";
    if (overlay === "tunnel" && previewHost.startsWith("tunnel-proxy:")) {
      overlayHint = ` The user connects via tunnel (e.g. Cloudflare). Preview URLs should use ${DEFAULT_SERVER_HOST} — the mobile app will route them through the proxy automatically.`;
    } else if (previewHost && previewHost !== "(not set)") {
      overlayHint = ` Prefer hostname (${previewHost}) for preview URLs so the remote client can reach the server.`;
    }

    const connectionContext =
      connectionType === "tunnel remote host"
        ? `The user is connecting via tunnel (e.g. Cloudflare Tunnel).${overlayHint}`
        : connectionType === DEFAULT_SERVER_HOST
          ? `The user is connecting via ${DEFAULT_SERVER_HOST}.`
          : `The user is connecting from a remote host (not ${DEFAULT_SERVER_HOST}).${overlayHint}`;
    const criticalPrompt = `CRITICAL: You are running within a process with PID ${process.pid}. The application that manages you is listening on port ${PORT}. You MUST NEVER kill this process (PID ${process.pid}) or occupy its port (${PORT}). If you kill this process, you will immediately terminate yourself.`;
    const connectionPrompt = `Connection context: ${connectionContext}`;
    const workspace = getWorkspaceCwd();
    const hostFromSocket = getRemoteHostFromSocket(socket);
    const effectiveRemoteHost =
      hostFromSocket ||
      (previewHost && previewHost !== "(not set)" ? previewHost : null) ||
      (connectionType === DEFAULT_SERVER_HOST ? DEFAULT_SERVER_HOST : null);
    const terminalRunnerContext =
      effectiveRemoteHost != null
        ? `When using the terminal-runner skill, REQUIRED parameters are pre-filled — use them and do NOT ask the user: workspace=${JSON.stringify(workspace)}, remote_host=${JSON.stringify(effectiveRemoteHost)}. Never prompt for workspace or remote_host.`
        : `When using the terminal-runner skill, use workspace=${JSON.stringify(workspace)}. For remote_host, the value could not be determined — ask the user for the IP or hostname their browser will use to access exposed services.`;

    const skillTagPrompt =
      `When a user message begins with a <skill>Use SKILL_NAME</skill> tag, you MUST activate the corresponding skill's protocol and follow its instructions for the rest of that message. ` +
      `If no <skill> tag is present, respond normally without applying any skill protocol.\n` +
      `Example:\n` +
      `  User: "<skill>Use systematic-debugging</skill> My app crashes on startup with a segfault"\n` +
      `  → You MUST follow the systematic-debugging skill protocol to diagnose and fix the crash.\n` +
      `  User: "How do I center a div?"\n` +
      `  → No skill tag present. Respond normally.`;

    const args = [
      "--mode", "rpc",
      "--provider", piProvider,
      "--model", piModel,
      "--session-dir", sessionDir,
      ...(existingSessionPath && fs.existsSync(existingSessionPath) ? ["--session", existingSessionPath] : []),
      "--no-skills",
      "--append-system-prompt", criticalPrompt,
      "--append-system-prompt", terminalRules,
      "--append-system-prompt", connectionPrompt,
      "--append-system-prompt", terminalRunnerContext,
      "--append-system-prompt", skillTagPrompt,
    ];

    // Register enabled skills: sync symlinks from skills-library into skills_enabled
    const skillsCfg = loadSkillsConfig();
    const skillsDir = path.join(projectRoot, skillsCfg.skillsLibraryDir);
    const skillsAgentDir = resolveAgentDir(cwd, projectRoot);
    const skillsEnabledDir = path.join(projectRoot, skillsCfg.skillsEnabledDir);
    const skillPaths = syncEnabledSkillsFolder(skillsDir, skillsAgentDir, skillsEnabledDir);
    if (skillPaths.length > 0) {
      args.push("--skill", skillsEnabledDir);
    }

    // Resolve agent dir: workspace .pi/agent first, then project root .pi/agent.
    // Auth in project root (.pi/agent/auth.json) is used when workspace has no auth.
    const workspaceAgentDir = path.join(cwd, ".pi", "agent");
    const workspaceAuthPath = path.join(workspaceAgentDir, "auth.json");
    const projectAgentDir = projectRoot ? path.join(projectRoot, ".pi", "agent") : null;
    const projectAuthPath = projectAgentDir ? path.join(projectAgentDir, "auth.json") : null;

    const agentDir =
      fs.existsSync(workspaceAuthPath)
        ? workspaceAgentDir
        : projectAuthPath && fs.existsSync(projectAuthPath)
          ? projectAgentDir
          : null;

    const spawnEnv = { ...process.env };
    if (agentDir) {
      spawnEnv.PI_CODING_AGENT_DIR = agentDir;
    }

    const child = spawn(PI_CLI_PATH, args, {
      cwd,
      env: spawnEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    piProcess = child;
    globalSpawnChildren.add(child);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const text = String(chunk ?? "");
      stdoutBuffer += text;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const jsonStart = line.indexOf("{");
        const candidate = jsonStart >= 0 ? line.slice(jsonStart) : line;
        try {
          const parsed = JSON.parse(candidate);
          handlePiEvent(parsed);
        } catch (_) {
          emitOutputLine(line + "\n");
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk ?? "");
      if (text) socket.emit("output", text);
    });

    child.on("exit", (code) => {
      globalSpawnChildren.delete(child);
      if (piProcess === child) piProcess = null;
      signalTurnComplete(Number.isInteger(code) ? code : 0);
    });
  }

  async function startTurn({ prompt, clientProvider, model }) {
    turnCompleted = false;
    turnRunning = true;
    closeIoOutputStream();
    await ensurePiProcess({
      clientProvider,
      model,
    });

    openPiIoOutputStream();
    // Emit session-started via emitOutputLine so the type field is embedded in the JSON body.
    // socket.emit("session-started", data) only passes the data object to SSE — the event name
    // is lost. The mobile SSE client detects this by parsed.type === "session-started",
    // so we must include type in the payload. The web Socket.IO client receives "output" events
    // and checks for parsed.type as well, so this format works for both transports.
    emitOutputLine(JSON.stringify({
      type: "session-started",
      provider: clientProvider ?? sessionManagement?.provider ?? DEFAULT_PROVIDER,
      session_id: null,
      permissionMode: null,
      allowedTools: [],
      useContinue: !!hasCompletedFirstRunRef?.value,
      approvalMode: null,
    }) + "\n");

    sendCommand({ type: "prompt", message: prompt });
  }

  function handleInput(data) {
    if (!piProcess || !pendingExtensionUiRequest) return false;

    const raw = typeof data === "string" ? data : JSON.stringify(data);
    const answers = parseAskQuestionAnswersFromInput(raw);
    const pending = pendingExtensionUiRequest;
    pendingExtensionUiRequest = null;

    const response = { type: "extension_ui_response", id: pending.id };

    if (pending.method === "confirm") {
      const approved = decideApprovalFromAnswers(answers, typeof data === "string" ? data : "");
      response.confirmed = approved;
    } else if (pending.method === "select") {
      const selected = Array.isArray(answers) && answers[0]?.selected?.[0];
      if (selected != null) {
        response.value = String(selected);
      } else {
        response.cancelled = true;
      }
    }

    sendCommand(response);
    return true;
  }

  function isTurnRunning() {
    return turnRunning;
  }

  return {
    isTurnRunning,
    close,
    startTurn,
    handleInput,
  };
}
