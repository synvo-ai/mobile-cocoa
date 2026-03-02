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
  DEFAULT_PROVIDER,
  DEFAULT_SERVER_HOST,
  PI_CLI_PATH, PORT,
  SESSIONS_ROOT,
  PI_SYSTEM_PROMPT_TERMINAL_RULES,
  loadModelsConfig,
  loadPiConfig,
  loadSkillsConfig,
  PI_FALLBACK_MODEL,
} from "../config/index.js";
import { buildMCPConfigForPi } from "../mcp/index.js";
import { resolveAgentDir, syncEnabledSkillsFolder } from "../skills/index.js";
import { getActiveOverlay, getPreviewHost } from "../utils/index.js";
import {
  decideApprovalFromAnswers,
  parseAskQuestionAnswersFromInput,
  slimEventForSse,
  toAskUserQuestionPayload,
} from "./piEventHandler.js";
import {
  getConnectionContext,
  getPiProviderForModel,
  getRemoteHostFromSocket,
  toPiModel,
} from "./piProviderMapping.js";

// Re-export for backward compatibility
export { getPiProviderForModel } from "./piProviderMapping.js";

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
  let turnApprovalMode = null;
  /** Path to the JSONL session log. Set when a turn begins; cleared when it ends. */
  let piIoOutputPath = null;
  let turnCompleted = false;
  const AUTO_APPROVE_MODES = new Set(["auto_edit"]);

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
            ...(assistantMessageEvent.toolCall != null ? { toolCall: assistantMessageEvent.toolCall } : {}),
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

  function normalizeApprovalMode(rawMode) {
    if (typeof rawMode !== "string") {
      return null;
    }
    const normalized = rawMode.trim().toLowerCase();
    if (!normalized) return null;
    if (AUTO_APPROVE_MODES.has(normalized)) return normalized;
    return normalized === "prompt" || normalized === "manual" ? normalized : null;
  }

  function shouldAutoApproveConfirm() {
    if (turnApprovalMode === "auto_edit") {
      return true;
    }
    const piCfgForApprove = loadPiConfig();
    return piCfgForApprove.autoApproveToolConfirm === true || piCfgForApprove.autoApproveToolConfirm === 1;
  }

  function setWaitingForPermission(waitingForPermission) {
    if (sessionManagement && typeof sessionManagement === "object") {
      sessionManagement.waitingForPermission = Boolean(waitingForPermission);
    }
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
    setWaitingForPermission(false);
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
    setWaitingForPermission(false);
    turnCompleted = true;
    if (!piProcess) return;
    globalSpawnChildren.delete(piProcess);
    terminateProcessTree(piProcess);
    piProcess = null;
    turnRunning = false;
  }

  function handlePiEvent(parsed) {
    if (!parsed || typeof parsed !== "object") return;
    const type = String(parsed.type ?? "");

    // Forward most events as-is (native Pi RPC protocol)
    if (type === "extension_ui_request") {
      const method = parsed.method;
      const normalizedMethod = typeof method === "string" ? method.toLowerCase() : "";
      // Dialog methods (select, confirm, input, editor) need user response
      if (["select", "confirm", "input", "editor"].includes(normalizedMethod)) {
        // Auto-approve confirm tool execution when requested for this turn.
        if (normalizedMethod === "confirm" && shouldAutoApproveConfirm()) {
          sendCommand({ type: "extension_ui_response", id: parsed.id, confirmed: true });
          return;
        }
        pendingExtensionUiRequest = { id: parsed.id, method, request: parsed };
        setWaitingForPermission(true);
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
      const errorMessage = parsed.error ?? "Pi request failed";
      emitOutputLine(`\r\n\x1b[31m[Error] ${errorMessage}\x1b[0m\r\n`);
      if (parsed.command === "prompt") {
        signalTurnComplete(1);
      }
      return;
    }

    if (type === "extension_error") {
      const errorMessage = parsed.error ?? "Extension error";
      emitOutputLine(`\r\n\x1b[31m[Error] ${errorMessage}\x1b[0m\r\n`);
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
    const modelsConfig = loadModelsConfig();
    const allKnownModels = Object.values(modelsConfig.providers ?? {}).flatMap(
      (providerConfig) => (providerConfig.models ?? []).map((modelOption) => modelOption.value)
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

    // Register enabled MCP servers: write config file and pass to Pi
    const mcpConfig = buildMCPConfigForPi();
    if (mcpConfig.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0) {
      const mcpDir = path.join(projectRoot, "server", "mcp");
      const mcpConfigPath = path.join(mcpDir, "runtime.json");
      try {
        fs.mkdirSync(mcpDir, { recursive: true });
        fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), "utf8");
        args.push("--mcp-config", mcpConfigPath);
      } catch (err) {
        console.warn("[PiRpcSession] Failed to write MCP config:", err?.message);
      }
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
        let parsed;
        try {
          parsed = JSON.parse(candidate);
        } catch (_) { }

        if (parsed !== undefined) {
          try {
            handlePiEvent(parsed);
          } catch (err) {
            console.error("[PiRpcSession] Error handling Pi event:", err);
          }
        } else {
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

  async function startTurn({ prompt, clientProvider, model, approvalMode }) {
    turnCompleted = false;
    turnRunning = true;
    turnApprovalMode = normalizeApprovalMode(approvalMode);
    setWaitingForPermission(false);
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
      approvalMode: turnApprovalMode,
    }) + "\n");

    sendCommand({ type: "prompt", message: prompt });
  }

  function handleInput(data) {
    if (!piProcess || !pendingExtensionUiRequest) return false;

    const inputText = typeof data === "string" ? data : JSON.stringify(data);
    const answers = parseAskQuestionAnswersFromInput(data);
    const pending = pendingExtensionUiRequest;
    pendingExtensionUiRequest = null;
    setWaitingForPermission(false);

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
    } else if (["input", "editor"].includes(pending.method)) {
      if (typeof data === "string" && data.trim()) {
        response.value = data;
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
