import type { Message, PendingAskUserQuestion, PermissionDenial } from "@/core/types";

/**
 * Context passed to AI provider event handlers (Strategy pattern).
 * New event types can be supported by registering a handler without modifying the dispatcher (Open-Closed).
 */
/** Tool use record for matching tool_result to tool_use (e.g. Gemini policy_violation). */
export interface ToolUseRecord {
  tool_name: string;
  tool_input?: Record<string, unknown>;
}

export interface EventContext {
  setPermissionDenials: (denials: PermissionDenial[] | null) => void;
  setWaitingForUserInput: (value: boolean) => void;
  setPendingAskQuestion: (value: PendingAskUserQuestion | null) => void;
  /** Set current tool/skill activity for UI display (null to clear). */
  setCurrentActivity: (description: string | null) => void;
  addMessage: (role: Message["role"], content: string, codeReferences?: { path: string; startLine: number; endLine: number }[]) => string;
  appendAssistantText: (chunk: string) => void;
  /** Current assistant message content (for delta-only append to avoid full-text display when stream ends). */
  getCurrentAssistantContent: () => string;
  /** Role of the last message in the chat (to detect stale ref when last is user but ref has content). Optional. */
  getLastMessageRole?: () => Message["role"] | null;
  /** Content of the last message (for deduplication). Optional. */
  getLastMessageContent?: () => string;
  deduplicateDenials: (denials: PermissionDenial[]) => PermissionDenial[];
  /** Record tool_use by id for later tool_result (e.g. policy_violation). Optional. */
  recordToolUse?: (id: string, data: ToolUseRecord) => void;
  /** Get and remove tool_use record by id. Optional. */
  getAndClearToolUse?: (id: string) => ToolUseRecord | null;
  /** Add a single permission denial (merge with existing). Optional. */
  addPermissionDenial?: (denial: PermissionDenial) => void;
  /** Set session ID from CLI stream (e.g. Claude "system", Gemini "init"). Optional. */
  setSessionId?: (id: string | null) => void;
}

export type EventHandler = (data: Record<string, unknown>, ctx: EventContext) => void;

/** Basename for display (no Node path dependency). */
export function basename(filePath: string): string {
  const s = String(filePath).replace(/\\/g, "/").trim();
  const parts = s.split("/");
  return parts[parts.length - 1] ?? s;
}

/**
 * Build a file: link for chat display. When tapped, opens the file in explorer.
 * Returns markdown link syntax: [label](file:<encodedPath>)
 */
function fileActivityLink(label: string, filePath: string | null): string {
  if (!filePath || typeof filePath !== "string") return label;
  const path = String(filePath).trim();
  if (!path) return label;
  return `[${label}](file:${encodeURIComponent(path)})`;
}

/** Format one compact file activity line where only filename is clickable. */
function fileActivityLine(prefix: string, file: string, filePath: string): string {
  return `${prefix} ${fileActivityLink(file, filePath)}`;
}

/** Append one tool-use display line in a consistent format. */
export function appendToolUseDisplayLine(
  ctx: EventContext,
  name: string,
  input: unknown
): void {
  const line = formatToolUseForDisplay(name, input);
  ctx.appendAssistantText(`\n\n<think>\n${line}\n</think>\n\n`);
}

/** Format one tool_use block as a short human-readable markdown line for the assistant bubble. */
export function formatToolUseForDisplay(name: string, input: unknown): string {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const filePath = obj.file_path ?? obj.path;
  const pathStr = filePath != null ? String(filePath).trim() : null;
  const file = pathStr ? basename(pathStr) : null;

  // Normalize tool names to display form. Include "bash" (Pi/Codex may send lowercase).
  const lower = String(name).trim().toLowerCase();
  const n =
    lower === "ask_user" ? "AskUserQuestion"
    : lower === "write_file" ? "Write"
    : (lower === "run_shell_command" || lower === "bash" || lower === "run_shell" || lower === "run_command")
      ? "Bash"
    : name;

  switch (n) {
    case "Read":
      return file && pathStr ? fileActivityLine("Reading", file, pathStr) : "Reading file";
    case "Edit":
      return file && pathStr ? fileActivityLine("Editing", file, pathStr) : "Editing file";
    case "Write":
      return file && pathStr ? fileActivityLine("Writing", file, pathStr) : "Writing file";
    case "Bash": {
      // Support obj.command (Claude/Codex) and obj.args?.command (Pi/OpenAI schema)
      const args = obj.args && typeof obj.args === "object" ? (obj.args as Record<string, unknown>) : null;
      const cmd =
        (obj.command != null ? String(obj.command).trim() : null)
        ?? (args?.command != null ? String(args.command).trim() : null)
        ?? "";
      // Prefer full command for mobile (UI will wrap/scroll). If very long, show start + " … " + end for path readability.
      const maxLen = 380;
      const displayCmd =
        cmd.length <= maxLen
          ? cmd
          : cmd.slice(0, maxLen - 20) + " … " + cmd.slice(-16);
      return displayCmd ? `Running command:\n\n\`${displayCmd}\`` : "Running command";
    }
    case "TodoWrite":
      return "Updating tasks";
    case "AskUserQuestion": {
      const questions = obj.questions as Array<{ question?: string; header?: string; options?: Array<{ label?: string }> }> | undefined;
      const q = Array.isArray(questions) && questions[0] ? questions[0] : null;
      const header = q?.header ? `${q.header}: ` : "";
      const question = (q?.question ?? "Question").slice(0, 80);
      const opts = q?.options?.map((o) => o.label ?? "").filter(Boolean).slice(0, 4).join(", ");
      return opts ? `**${header}**${question} — _${opts}_` : `**${header}**${question}`;
    }
    case "Grep":
    case "Glob":
      return file ? `\`${n}\` in \`${file}\`` : `${n}`;
    default:
      return file ? `**${n}** \`${file}\`` : `**${n}**`;
  }
}
