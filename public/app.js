const chatMessages = document.getElementById("chat-messages");
const typingIndicator = document.getElementById("typing-indicator");
const promptInput = document.getElementById("prompt-input");
const sendBtn = document.getElementById("send-btn");
const inputForm = document.getElementById("input-form");
const statusDot = document.getElementById("status-dot");
const statusLabel = document.getElementById("status-label");
const permissionContainer = document.getElementById("permission-denial-container");
const permissionModeSelect = document.getElementById("permission-mode");
const sidebar = document.getElementById("sidebar");
const sidebarTree = document.getElementById("sidebar-tree");
const sidebarWorkspaceName = document.getElementById("sidebar-workspace-name");
const sidebarToggle = document.getElementById("sidebar-toggle");

/** Current AI provider ("claude" | "gemini"). Fixed during chat; user cannot switch provider. */
let currentProvider = "gemini";

/** Model options per provider. Used for model dropdown only (provider not selectable in chat). */
const CLAUDE_MODELS = [
  { value: "haiku", label: "Haiku 4.5" },
  { value: "sonnet", label: "Sonnet 4.5" },
  { value: "opus", label: "Opus 4.5" },
];
const GEMINI_MODELS = [
  { value: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro Low" },
  { value: "gemini-3.1-flash", label: "Gemini 3.1 Flash" },
  { value: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro High" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
];
const DEFAULT_CLAUDE_MODEL = "sonnet";
const DEFAULT_GEMINI_MODEL = "gemini-3.1-pro-preview";

function getModelsForProvider(provider) {
  return provider === "claude" ? CLAUDE_MODELS : GEMINI_MODELS;
}

/** Current model. User can switch model only; provider is fixed. */
let currentModel = DEFAULT_GEMINI_MODEL;

const socket = io();

/* --- Sidebar (VSCode-style file explorer) --- */
let sidebarRefreshIntervalMs = 3000;
let sidebarRefreshTimer = null;
let expandedPaths = new Set([""]);

async function fetchSidebarConfig() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    if (cfg.sidebarRefreshIntervalMs && cfg.sidebarRefreshIntervalMs > 0) {
      sidebarRefreshIntervalMs = cfg.sidebarRefreshIntervalMs;
    }
  } catch (_) { }
}

async function fetchWorkspaceTree() {
  try {
    const res = await fetch("/api/workspace-tree");
    const data = await res.json();
    if (data.tree && data.root) return data;
  } catch (_) { }
  return null;
}

function renderTreeItem(item, depth = 0) {
  if (item.type === "folder") {
    const wrapper = document.createElement("div");
    wrapper.className = "sidebar-tree-folder";

    const row = document.createElement("div");
    row.className = "sidebar-tree-item";
    row.style.setProperty("--depth", String(depth));
    row.dataset.path = item.path;
    row.dataset.type = "folder";

    const isExpanded = expandedPaths.has(item.path);
    const icon = document.createElement("span");
    icon.className = `tree-icon ${isExpanded ? "folder-open" : "folder-closed"}`;
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = item.name;
    row.appendChild(icon);
    row.appendChild(label);

    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (expandedPaths.has(item.path)) expandedPaths.delete(item.path);
      else expandedPaths.add(item.path);
      renderSidebarTree(currentTreeData);
    });

    wrapper.appendChild(row);

    const childrenDiv = document.createElement("div");
    childrenDiv.className = `sidebar-tree-children ${isExpanded ? "" : "hidden"}`;
    if (item.children && item.children.length) {
      for (const child of item.children) {
        childrenDiv.appendChild(renderTreeItem(child, depth + 1));
      }
    }
    wrapper.appendChild(childrenDiv);
    return wrapper;
  }

  const row = document.createElement("div");
  row.className = "sidebar-tree-item";
  row.style.setProperty("--depth", String(depth));
  row.dataset.path = item.path;
  row.dataset.type = "file";
  const icon = document.createElement("span");
  icon.className = "tree-icon file";
  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = item.name;
  row.appendChild(icon);
  row.appendChild(label);
  return row;
}

let currentTreeData = null;

function renderSidebarTree(data) {
  if (!data || !sidebarTree) return;
  currentTreeData = data;
  sidebarWorkspaceName.textContent = data.root || "Workspace";
  sidebarTree.innerHTML = "";
  for (const item of data.tree) {
    sidebarTree.appendChild(renderTreeItem(item, 0));
  }
}

async function refreshSidebar() {
  const data = await fetchWorkspaceTree();
  if (data) renderSidebarTree(data);
}

function startSidebarRefresh() {
  if (sidebarRefreshTimer) clearInterval(sidebarRefreshTimer);
  if (sidebarRefreshIntervalMs > 0) {
    sidebarRefreshTimer = setInterval(refreshSidebar, sidebarRefreshIntervalMs);
  }
}

function isMobileView() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
}

async function initSidebar() {
  await fetchSidebarConfig();
  await refreshSidebar();
  startSidebarRefresh();

  if (isMobileView()) {
    sidebar?.classList.add("collapsed");
  }

  sidebarToggle?.addEventListener("click", () => {
    sidebar?.classList.toggle("collapsed");
  });

  const sidebarOpenBtn = document.getElementById("sidebar-open-btn");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  sidebarOpenBtn?.addEventListener("click", () => {
    sidebar?.classList.remove("collapsed");
  });
  sidebarOverlay?.addEventListener("click", () => {
    sidebar?.classList.add("collapsed");
  });
}

let sessionRunning = false;
/** Options used for the current or last Claude run (set by server on claude-started). */
let lastRunOptions = { permissionMode: null, allowedTools: [], useContinue: false };
let waitingForUserInput = false;
let outputBuffer = "";
let currentAssistantMessage = null;

const DEFAULT_PLACEHOLDER = "How can I help you today?";
// Remove PTY control/escape sequences sent by the Claude CLI (e.g. cursor hide/show codes).
const ANSI_REGEX =
  /\x1B\[[0-9;?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[@-_]|\x1B.|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PROVIDER_ACCENT = { gemini: "#1a73e8", claude: "#b3541e", codex: "#19c37d" };

function getHighlightColorForProvider(provider) {
  return PROVIDER_ACCENT[provider] || PROVIDER_ACCENT.gemini;
}

/** Replace span background-color highlights with text color using the provider's theme accent. */
function replaceHighlightWithTextColor(str, highlightColor) {
  return (str || "").replace(/style="([^"]+)"/gi, (match, inner) => {
    if (!/background-color\s*:/i.test(inner)) return match;
    const cleaned = inner
      .replace(/\s*background-color\s*:\s*[^;]+;?/gi, "")
      .replace(/\s*;\s*;\s*/g, ";")
      .replace(/^[\s;]+|[\s;]+$/g, "")
      .trim();
    return cleaned ? `style="color: ${highlightColor}; ${cleaned}"` : `style="color: ${highlightColor}"`;
  });
}

function formatText(text) {
  const color = getHighlightColorForProvider(currentProvider);
  return escapeHtml(replaceHighlightWithTextColor(text || "", color)).replace(/\n/g, "<br>");
}

function stripAnsi(value) {
  if (!value) return "";
  return value.replace(ANSI_REGEX, "");
}

function scrollToBottom() {
  chatMessages.parentElement.scrollTo({
    top: chatMessages.parentElement.scrollHeight,
    behavior: "smooth",
  });
}

function createMessageElement(role, content, meta = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "assistant" ? (currentProvider === "gemini" ? "G" : "C") : role === "user" ? "You" : "!";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = formatText(content);
  bubble.dataset.rawText = content || "";

  if (role === "user") {
    wrapper.appendChild(bubble);
    wrapper.appendChild(avatar);
  } else {
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
  }

  if (role === "system") {
    wrapper.classList.add("system");
  }

  if (meta.id) wrapper.dataset.id = meta.id;

  chatMessages.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function addSystemMessage(text) {
  return createMessageElement("system", text);
}

function addUserMessage(text) {
  return createMessageElement("user", text);
}

function ensureAssistantMessage() {
  if (!currentAssistantMessage) {
    currentAssistantMessage = createMessageElement("assistant", "");
  }
  return currentAssistantMessage;
}

function appendAssistantText(chunk) {
  const sanitized = stripAnsi(chunk);
  if (!sanitized) return;
  const message = ensureAssistantMessage();
  const bubble = message.querySelector(".bubble");
  const current = bubble.dataset.rawText || "";
  const next = current + sanitized;
  bubble.dataset.rawText = next;
  bubble.innerHTML = formatText(next);
  if (sessionRunning) {
    setTypingIndicator(true);
  }
}

function finalizeAssistantMessage() {
  if (currentAssistantMessage) {
    currentAssistantMessage = null;
  }
  setTypingIndicator(false);
}

function setTypingIndicator(state) {
  typingIndicator.hidden = !state;
}

function setConnectionState(connected) {
  statusDot.classList.toggle("connected", connected);
  statusDot.classList.toggle("disconnected", !connected);
  statusLabel.textContent = connected ? "Online" : "Offline";
}

function refreshInputState() {
  if (waitingForUserInput) {
    promptInput.placeholder = "Type response for Claude…";
    promptInput.disabled = false;
    sendBtn.disabled = false;
    return;
  }
  promptInput.placeholder = DEFAULT_PLACEHOLDER;
  const disabled = sessionRunning;
  promptInput.disabled = disabled;
  sendBtn.disabled = disabled;
}

function enableInteractiveInput(prompt) {
  waitingForUserInput = true;
  if (prompt) addSystemMessage(prompt);
  refreshInputState();
}

function disableInteractiveInput() {
  waitingForUserInput = false;
  refreshInputState();
}

function deniedToolToAllowedPattern(toolName) {
  if (!toolName || typeof toolName !== "string") return null;
  const t = toolName.trim();
  if (t === "Bash") return "Bash(*)";
  if (["Write", "Edit", "Read"].includes(t)) return t;
  return t;
}

function getAllowedToolsFromDenials(denials) {
  if (!Array.isArray(denials) || !denials.length) return [];
  const seen = new Set();
  const out = [];
  for (const denial of denials) {
    const pattern = deniedToolToAllowedPattern(denial.tool_name || denial.tool || "");
    if (pattern && !seen.has(pattern)) {
      seen.add(pattern);
      out.push(pattern);
    }
  }
  return out;
}

function showPermissionDenialBanner(denials) {
  if (!permissionContainer) return;
  const banner = document.createElement("div");
  banner.className = "permission-denial-banner";
  const allowedTools = getAllowedToolsFromDenials(denials);
  const summary = denials.length === 1 ? "Permission denied" : "Permissions denied";
  const detail = denials
    .map((d) => {
      const tool = d.tool_name || d.tool || "?";
      const path = d.tool_input?.file_path || d.tool_input?.path || "";
      return path ? `${tool}: ${path}` : tool;
    })
    .join("<br>");
  banner.innerHTML = `
    <div class="summary">${summary}</div>
    <div class="detail">${detail}</div>
    <div class="actions">
      <button type="button" class="reject">Dismiss</button>
      <button type="button" class="accept">Accept & retry</button>
    </div>
  `;
  banner.querySelector(".reject").addEventListener("click", () => banner.remove());
  banner.querySelector(".accept").addEventListener("click", () => {
    banner.remove();
    const permissionMode = permissionModeSelect?.value || undefined;
    socket.emit("submit-prompt", {
      prompt: "Permissions granted, try again.",
      allowedTools,
      permissionMode,
      provider: currentProvider,
      model: currentModel,
      retryAfterPermissionDenial: true,
    });
  });
  permissionContainer.appendChild(banner);
}

function isClaudeStream(data) {
  if (typeof data !== "object" || data === null) return false;
  const types = ["system", "assistant", "result", "user", "input", "permission_request", "init", "message"];
  return types.includes(data.type) || Array.isArray(data.permission_denials);
}

function handleClaudeEvent(data) {
  if (Array.isArray(data.permission_denials) && data.permission_denials.length) {
    showPermissionDenialBanner(data.permission_denials);
  }

  switch (data.type) {
    case "system":
    case "init": {
      const info = [];
      if (data.session_id) info.push(`Session ID: ${data.session_id}`);
      if (data.model) info.push(`Model: ${data.model}`);
      if (data.cwd) info.push(`Working Directory: ${data.cwd}`);
      if (data.model) {
        const modelNameEl = document.querySelector(".model-name");
        if (modelNameEl) modelNameEl.textContent = data.model;
      }
      if (info.length) addSystemMessage(info.join("\n"));
      break;
    }
    case "assistant": {
      const parts = [];
      for (const content of data.message?.content || []) {
        if (content.type === "text") {
          parts.push(content.text);
        }
      }
      appendAssistantText(parts.join(""));
      break;
    }
    case "message": {
      if (data.role !== "model") break;
      const msg = data.message ?? data;
      const contents = msg?.content ?? msg?.parts ?? [];
      const parts = [];
      for (const c of contents) {
        if (c.type === "text") parts.push(c.text ?? "");
      }
      appendAssistantText(parts.join(""));
      break;
    }
    case "input":
    case "permission_request": {
      const tool = data.tool_name || data.tool || "Tool";
      const prompt = data.prompt || data.message || data.description || "Claude needs your input.";
      enableInteractiveInput(`${tool} request:\n${prompt}\n(Type a response and press Enter)`);
      break;
    }
    case "user": {
      // skip echo
      break;
    }
    case "result": {
      // ignore summary chunk
      break;
    }
    default: {
      if (typeof data === "string") appendAssistantText(`${data}\n`);
    }
  }
}

function handleRawLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isClaudeStream(parsed)) {
        handleClaudeEvent(parsed);
        socket.emit("claude-debug", { type: parsed.type, raw: trimmed });
        return;
      }
    } catch (_) {
      // fall through to plain text
    }
  }
  appendAssistantText(line + "\n");
}

socket.on("output", (chunk) => {
  outputBuffer += chunk;
  const parts = outputBuffer.split("\n");
  const incomplete = parts.pop() ?? "";
  outputBuffer = "";

  for (const part of parts) {
    handleRawLine(part);
  }

  if (incomplete.startsWith("{")) {
    outputBuffer = incomplete;
  } else if (incomplete) {
    appendAssistantText(incomplete);
  }
});

socket.on("connect", () => {
  setConnectionState(true);
});

socket.on("disconnect", () => {
  setConnectionState(false);
});

socket.on("claude-started", (payload) => {
  if (payload && typeof payload === "object") {
    lastRunOptions = {
      permissionMode: payload.permissionMode ?? null,
      allowedTools: Array.isArray(payload.allowedTools) ? payload.allowedTools : [],
      useContinue: !!payload.useContinue,
    };
  }
  sessionRunning = true;
  finalizeAssistantMessage();
  setTypingIndicator(true);
  disableInteractiveInput();
  refreshInputState();
});

socket.on("exit", () => {
  sessionRunning = false;
  disableInteractiveInput();
  refreshInputState();
  finalizeAssistantMessage();
  addSystemMessage("Chat completed.");
  promptInput.focus();
});

function submitPrompt() {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  if (waitingForUserInput && sessionRunning) {
    socket.emit("input", `${prompt}\r`);
    addUserMessage(prompt);
    promptInput.value = "";
    disableInteractiveInput();
    return;
  }

  if (sessionRunning) return;

  const permissionMode = permissionModeSelect?.value || undefined;
  socket.emit("submit-prompt", { prompt, permissionMode, provider: currentProvider, model: currentModel });
  addUserMessage(prompt);
  promptInput.value = "";
}

inputForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt();
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitPrompt();
  }
});

sendBtn.addEventListener("click", submitPrompt);

function getCurrentUiOptions() {
  const mode = permissionModeSelect?.value?.trim() || "";
  return {
    permissionMode: mode || null,
    label: mode === "ask" ? "Ask each tool" : mode === "auto" ? "Auto approve" : "Auto",
  };
}

document.getElementById("btn-attach")?.addEventListener("click", () => {
  addSystemMessage("Attachments are not supported in this prototype.");
});

setConnectionState(false);
refreshInputState();
setTypingIndicator(false);

initSidebar();

function initProviderSelector() {
  document.body.classList.add(currentProvider === "gemini" ? "provider-gemini" : "provider-claude");
  if (promptInput) promptInput.placeholder = currentProvider === "gemini" ? "Ask Gemini" : DEFAULT_PLACEHOLDER;
  const container = inputForm || permissionModeSelect?.parentNode;
  if (!container) return;
  const wrap = document.createElement("span");
  wrap.style.display = "inline-flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "8px";
  wrap.style.marginRight = "8px";
  wrap.style.flexShrink = "0";
  wrap.innerHTML = '<label class="input-bar-label">Model: <select id="model-select"></select></label>';
  const modelSel = wrap.querySelector("#model-select");
  const models = getModelsForProvider(currentProvider);
  const defaultModel = currentProvider === "claude" ? DEFAULT_CLAUDE_MODEL : DEFAULT_GEMINI_MODEL;
  const validValues = models.map((m) => m.value);
  if (!validValues.includes(currentModel)) currentModel = defaultModel;
  modelSel.innerHTML = models.map((m) => `<option value="${m.value}">${m.label}</option>`).join("");
  modelSel.value = currentModel;

  container.insertBefore(wrap, container.firstChild);

  modelSel.addEventListener("change", () => {
    currentModel = modelSel.value;
  });
}
initProviderSelector();
