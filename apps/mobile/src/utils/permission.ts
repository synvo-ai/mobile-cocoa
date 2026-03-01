
export type PermissionModeUI = "always_ask" | "ask_once_per_session" | "yolo";

export type BackendPermissionResult = {
  permissionMode?: string;
  approvalMode?: string;
  askForApproval?: string;
  fullAuto?: boolean;
  yolo?: boolean;
};

type PermissionMap = Record<PermissionModeUI, BackendPermissionResult>;

const CODEX_PERMISSION_BY_UI: PermissionMap = {
  yolo: { yolo: true },
  always_ask: { askForApproval: "untrusted" },
  ask_once_per_session: { askForApproval: "on-request" },
};

const CLAUDE_PERMISSION_BY_UI: PermissionMap = {
  yolo: { permissionMode: "bypassPermissions" },
  always_ask: { permissionMode: "acceptEdits" },
  ask_once_per_session: { permissionMode: "default" },
};

const DEFAULT_PERMISSION_BY_UI: PermissionMap = {
  yolo: { approvalMode: "auto_edit" },
  always_ask: { approvalMode: "plan" },
  ask_once_per_session: { approvalMode: "default" },
};

/**
 * Maps UI permission mode to backend-specific config for each provider.
 */
export function getBackendPermissionMode(
  ui: PermissionModeUI,
  provider: string
): BackendPermissionResult {
  if (provider === "codex") return CODEX_PERMISSION_BY_UI[ui];
  if (provider === "claude") return CLAUDE_PERMISSION_BY_UI[ui];
  return DEFAULT_PERMISSION_BY_UI[ui];
}
