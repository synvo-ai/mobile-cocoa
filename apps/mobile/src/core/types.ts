/**
 * Core domain types and interfaces.
 * 
 * This module defines all domain types using:
 * - Interface Segregation: Small, focused interfaces
 * - Type safety: Strongly typed domain entities
 * - Documentation: Every type is documented
 * 
 * Components and hooks depend on these abstractions instead of concrete implementations,
 * enabling dependency injection and easier testing.
 */

/** 
 * Code reference for display in chat messages.
 * Shows file name and line numbers for code blocks.
 */
export type CodeReference = {
  /** File path relative to workspace */
  path: string;
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
};

/** 
 * Chat message in the conversation.
 * Can be from user, assistant, or system.
 */
export type Message = {
  /** Unique message identifier */
  id: string;
  /** Message author role */
  role: "user" | "assistant" | "system";
  /** Message content (markdown supported) */
  content: string;
  /** Optional code references for context */
  codeReferences?: CodeReference[];
};

/**
 * Pending render command extracted from Claude output.
 * Shown in the UI for user to execute.
 */
export type PendingRender = {
  /** Shell command to execute */
  command: string;
  /** Preview URL associated with the command */
  url: string;
};

/**
 * Permission denial from Claude.
 * Occurs when Claude requests tool use that requires permission.
 */
export type PermissionDenial = {
  /** Tool name that was denied */
  tool_name?: string;
  /** Alternative tool property */
  tool?: string;
  /** Tool input parameters */
  tool_input?: { file_path?: string; path?: string };
};

/**
 * Options from the last Claude run.
 * Used for retrying with same settings.
 */
export type LastRunOptions = {
  /** Permission mode used */
  permissionMode: string | null;
  /** Allowed tool patterns */
  allowedTools: string[];
  /** Whether --continue flag was used */
  useContinue: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════
// Interface Segregation: Small, focused interfaces
// ═══════════════════════════════════════════════════════════════════════════

/** Connection status only. Used by connection indicator components. */
export interface IConnectionState {
  /** Whether transport connection is active */
  connected: boolean;
}

/** Option for AskUserQuestion tool. */
export type AskUserQuestionOption = {
  /** Display label */
  label: string;
  /** Optional longer description */
  description?: string;
};

/** Single question in AskUserQuestion tool input. */
export type AskUserQuestionItem = {
  /** Question text (optional if header is descriptive) */
  question?: string;
  /** Header/title for the question */
  header: string;
  /** Available options to select */
  options: AskUserQuestionOption[];
  /** Whether multiple options can be selected */
  multiSelect?: boolean;
};

/** Pending AskUserQuestion tool call shown in UI. */
export type PendingAskUserQuestion = {
  /** Tool use ID for the response */
  tool_use_id: string;
  /** Optional UUID */
  uuid?: string;
  /** Questions to display */
  questions: AskUserQuestionItem[];
  /** Optional request method from extension_ui_request (confirm/input/select/editor). */
  requestMethod?: string;
};

/** Chat messages and typing state. Used by chat UI components. */
export interface IChatState {
  /** All messages in the conversation */
  messages: Message[];
  /** Whether the AI agent is currently running */
  sessionRunning: boolean;
  /** Whether waiting for user input (permission prompt) */
  waitingForUserInput: boolean;
}

/** Permission denials and last run options. Used by permission banner. */
export interface IPermissionState {
  /** Current permission denials (null if none) */
  permissionDenials: PermissionDenial[] | null;
  /** Options from last run for retry */
  lastRunOptions: LastRunOptions;
}

/** 
 * Server configuration interface.
 * Provides base URL and preview URL resolution.
 * Injected for testability.
 */
export interface IServerConfig {
  /** Get the server base URL */
  getBaseUrl(): string;
  /** Resolve a preview URL (handles localhost -> tunnel URL when using Cloudflare) */
  resolvePreviewUrl(previewUrl: string): string;
}

/**
 * Workspace file service interface.
 * Abstracts file fetching for testability.
 */
export interface IWorkspaceFileService {
  /**
   * Fetch a file from the workspace.
   * @param path - Relative file path
   * @returns File content and image flag
   */
  fetchFile(path: string): Promise<{ content: string | null; isImage: boolean }>;
}

/**
 * Stream transport factory interface.
 * Enables swapping transport implementations in tests.
 */
export interface IStreamConnectionFactory {
  /** Create a transport connection */
  create(url: string): unknown;
}
