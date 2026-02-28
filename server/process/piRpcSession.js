/**
 * Pi RPC session manager.
 *
 * Spawns `pi --mode rpc` and forwards events to the socket.
 * Uses native Pi RPC protocol; extension_ui_request is transformed to AskUserQuestion
 * for compatibility with the client's approval modal.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  PI_CLI_PATH, PORT,
  SESSIONS_ROOT
} from "../config/index.js";
import { resolveAgentDir, syncEnabledSkillsFolder } from "../skills/index.js";
import { getActiveOverlay, getPreviewHost } from "../utils/index.js";

const CLIENT_PROVIDER_TO_PI = {
  claude: "anthropic", // OAuth from auth.json
  codex: "openai-codex", // OAuth from auth.json
  gemini: "google-gemini-cli", // OAuth from auth.json
};

/** Map client short model names to Pi CLI model IDs (Pi expects anthropic/claude-sonnet-4-5, not anthropic/sonnet4.5). */
const CLIENT_MODEL_TO_PI = {
  "sonnet4.5": "claude-sonnet-4-5",
  "opus4.5": "claude-opus-4-5",
};

function toPiModel(clientModel, piProvider) {
  if (piProvider === "anthropic" && clientModel && CLIENT_MODEL_TO_PI[clientModel]) {
    return CLIENT_MODEL_TO_PI[clientModel];
  }
  return clientModel;
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
  if (/^127\.|^::1$|^localhost$/i.test(host)) return "localhost";
  return host;
}

/**
 * Derive connection context from socket for Pi agent awareness.
 * Supports tunnel (dev proxy, e.g. Cloudflare) and localhost connections.
 * @param {import('socket.io').Socket} socket
 * @returns {string} "localhost", "tunnel remote host", or "remote"
 */
function getConnectionContext(socket) {
  const addr = String(socket?.handshake?.address ?? socket?.conn?.remoteAddress ?? "");
  const host = String((socket?.handshake?.headers?.host ?? "").split(":")[0] ?? "");
  const raw = `${addr} ${host}`.toLowerCase();

  const overlay = getActiveOverlay();
  if (overlay === "tunnel") {
    const tunnelHeader = socket?.handshake?.headers?.["x-tunnel-proxy"];
    if (tunnelHeader) return "tunnel remote host";
    if (/^127\.|::1|localhost/i.test(raw)) return "localhost";
    return "tunnel remote host";
  }

  if (/^127\.|::1|localhost/i.test(raw)) return "localhost";
  return "remote";
}

function getPiProviderForModel(clientProvider, model) {
  if (typeof model === "string" && /^gemini-/.test(model)) return "google-gemini-cli";
  if (typeof model === "string" && /^gpt-/.test(model)) return "openai-codex";
  if (typeof model === "string" && (/^claude-/.test(model) || /^(sonnet4\.5|opus4\.5|claude-haiku)/.test(model))) return "anthropic";
  if (clientProvider === "gemini") return "google-gemini-cli";
  if (clientProvider === "claude") return "anthropic";
  return "openai-codex";
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
  const raw = typeof fallbackRaw === "string" ? fallbackRaw.trim().toLowerCase() : "";
  if (["y", "yes", "approve", "accept", "allow", "run"].includes(raw)) return true;
  if (["n", "no", "deny", "decline", "reject", "cancel", "block"].includes(raw)) return false;
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
    const str = typeof line === "string" ? line : JSON.stringify(line);
    const trimmed = str.trimEnd();
    if (trimmed.startsWith('{"type":"message_update"')) {
      try {
        const parsed = JSON.parse(trimmed);
        const ev = parsed.assistantMessageEvent ?? {};
        const slim = {
          type: "message_update",
          assistantMessageEvent: {
            type: ev.type,
            contentIndex: ev.contentIndex,
            delta: ev.delta ?? ev.content,
          },
        };
        appendToSessionLog(JSON.stringify(slim) + "\n");
      } catch {
        appendToSessionLog(str + (str.endsWith("\n") ? "" : "\n"));
      }
    } else {
      appendToSessionLog(str + (str.endsWith("\n") ? "" : "\n"));
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

  function close() {
    closeIoOutputStream();
    pendingExtensionUiRequest = null;
    turnCompleted = true;
    if (!piProcess) return;
    globalSpawnChildren.delete(piProcess);
    try {
      piProcess.kill();
    } catch (_) { }
    piProcess = null;
    turnRunning = false;
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
        const autoApprove = process.env.PI_AUTO_APPROVE_TOOL_CONFIRM === "true" || process.env.PI_AUTO_APPROVE_TOOL_CONFIRM === "1";
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
      console.log("[pi] agent_end received", JSON.stringify(context));
      // Ensure agent_end remains observable in the streamed payload before finalizing.
      emitOutputLine(JSON.stringify(parsed) + "\n");
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

    // Forward all events to client (native Pi protocol)
    emitOutputLine(JSON.stringify(parsed) + "\n");
  }

  async function ensurePiProcess(options) {
    if (piProcess) return;

    const piProvider = getPiProviderForModel(options.clientProvider ?? "claude", options.model);
    const rawModel = options.model ?? (piProvider === "anthropic" ? "claude-sonnet-4-5" : piProvider === "openai" || piProvider === "openai-codex" ? "gpt-4o" : "gemini-2.0-flash");
    const piModel = toPiModel(rawModel, piProvider);
    const cwd = getWorkspaceCwd();
    // Session dir = base sessions folder (sessions/). Pi expects this base; it creates
    // sessions/{sessionId}/ internally. Passing sessions/sessionId causes Pi to create
    // "sessions-{sessionId}" (path separators replaced by -) as a sibling folder.
    const sessionDir = path.join(SESSIONS_ROOT, "sessions");

    try {
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch (_) { }

    const terminalRules =
      "When running terminal commands: (1) MANDATORY: use the Bash tool for every terminal command step — never use run_terminal_cmd, run_command, or alternatives; (2) use ad-hoc bash, not persistent shells; (3) when starting background servers, ALWAYS use nohup + disown: nohup bash -c 'cd dir && ... && python run.py' >> log 2>&1 & disown — Pi's Bash tool waits for children, so nohup+disown prevents the call from hanging;";
    const connectionType = getConnectionContext(socket);
    const previewHost = getPreviewHost();
    const overlay = getActiveOverlay();

    // Build overlay-specific hint for preview URLs
    let overlayHint = "";
    if (overlay === "tunnel" && previewHost.startsWith("tunnel-proxy:")) {
      overlayHint = " The user connects via tunnel (e.g. Cloudflare). Preview URLs should use localhost — the mobile app will route them through the proxy automatically.";
    } else if (previewHost && previewHost !== "(not set)") {
      overlayHint = ` Prefer hostname (${previewHost}) for preview URLs so the remote client can reach the server.`;
    }

    const connectionContext =
      connectionType === "tunnel remote host"
        ? `The user is connecting via tunnel (e.g. Cloudflare Tunnel).${overlayHint}`
        : connectionType === "localhost"
          ? "The user is connecting via localhost."
          : `The user is connecting from a remote host (not localhost).${overlayHint}`;
    const criticalPrompt = `CRITICAL: You are running within a process with PID ${process.pid}. The application that manages you is listening on port ${PORT}. You MUST NEVER kill this process (PID ${process.pid}) or occupy its port (${PORT}). If you kill this process, you will immediately terminate yourself.`;
    const connectionPrompt = `Connection context: ${connectionContext}`;
    const workspace = getWorkspaceCwd();
    const hostFromSocket = getRemoteHostFromSocket(socket);
    const effectiveRemoteHost =
      hostFromSocket ||
      (previewHost && previewHost !== "(not set)" ? previewHost : null) ||
      (connectionType === "localhost" ? "localhost" : null);
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

    console.log("[pi] system prompt injected:");
    console.log("[pi]   1.", criticalPrompt);
    console.log("[pi]   2.", terminalRules);
    console.log("[pi]   3.", connectionPrompt);
    console.log("[pi]   4. terminal-runner context:", terminalRunnerContext);
    console.log("[pi]   5. skill-tag awareness:", skillTagPrompt);

    // Register enabled skills: sync symlinks from ./server/skills-library into ./server/skills_enabled
    const skillsDir = path.join(projectRoot, "server", "skills-library");
    const skillsAgentDir = resolveAgentDir(cwd, projectRoot);
    const skillsEnabledDir = path.join(projectRoot, "server", "skills_enabled");
    const skillPaths = syncEnabledSkillsFolder(skillsDir, skillsAgentDir, skillsEnabledDir);
    if (skillPaths.length > 0) {
      args.push("--skill", skillsEnabledDir);
    }

    const commandStr = [PI_CLI_PATH, ...args].join(" ");
    console.log("[pi] command:", commandStr);

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

  async function startTurn({ prompt, options }) {
    turnCompleted = false;
    closeIoOutputStream();
    await ensurePiProcess({
      clientProvider: options.clientProvider,
      model: options.model,
    });

    openPiIoOutputStream();
    // No temp folders: Pi writes to .pi/sessions; we only emit to socket
    socket.emit("claude-started", {
      provider: options.clientProvider ?? sessionManagement?.provider ?? "claude",
      session_id: null,
      permissionMode: null,
      allowedTools: [],
      useContinue: !!hasCompletedFirstRunRef?.value,
      approvalMode: null,
    });

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

  function hasProcess() {
    return piProcess !== null;
  }

  function isTurnRunning() {
    return turnRunning;
  }

  return {
    hasProcess,
    isTurnRunning,
    close,
    startTurn,
    handleInput,
  };
}
