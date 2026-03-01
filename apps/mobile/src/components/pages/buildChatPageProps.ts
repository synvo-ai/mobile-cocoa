import type { ChatActionControllerState } from "@/components/controllers/ChatActionController";
import type { SseSessionControllerState } from "@/components/controllers/SseSessionController";
import type { ThemeSessionStateState } from "@/components/controllers/ThemeSessionState";
import type { WorkspaceFileControllerState } from "@/components/controllers/WorkspaceFileController";
import type { SidebarTab } from "@/components/hooks/useSidebarState";
import type { ChatPageProps } from "@/components/pages/ChatPage";
import type { IServerConfig } from "@/core/types";
import { basename } from "@/utils/path";

export type BuildChatPagePropsInput = {
  themeState: ThemeSessionStateState;
  sseState: SseSessionControllerState;
  workspaceState: WorkspaceFileControllerState;
  chatActionState: ChatActionControllerState;
  sidebarVisible: boolean;
  sidebarActiveTab: SidebarTab;
  setSidebarActiveTab: (tab: SidebarTab) => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  onChatFileSelect: (path: string) => void;
  onWorkspaceSelectedFromPicker: (path?: string) => void;
  serverConfig: Pick<IServerConfig, "getBaseUrl" | "resolvePreviewUrl">;
};

export function buildChatPageProps({
  themeState,
  sseState,
  workspaceState,
  chatActionState,
  sidebarVisible,
  sidebarActiveTab,
  setSidebarActiveTab,
  openSidebar,
  closeSidebar,
  onChatFileSelect,
  onWorkspaceSelectedFromPicker,
  serverConfig,
}: BuildChatPagePropsInput): ChatPageProps {
  const currentSessionLabel = (sseState.sessionId ?? "").split("-")[0] || "—";

  return {
    context: {
      theme: themeState.theme,
      themeMode: themeState.themeMode,
      styles: themeState.styles,
      provider: themeState.provider,
      model: themeState.model,
      modelOptions: themeState.modelOptions,
      providerModelOptions: themeState.providerModelOptions,
      permissionModeUI: themeState.permissionModeUI,
    },
    runtime: {
      connected: sseState.connected,
      permissionDenials: sseState.permissionDenials ?? [],
      lastSessionTerminated: sseState.lastSessionTerminated,
      tailBoxMaxHeight: sseState.tailBoxMaxHeight,
      sessionRunning: sseState.sessionRunning,
      waitingForUserInput: sseState.waitingForUserInput,
    },
    header: {
      workspaceName: workspaceState.workspacePath ? basename(workspaceState.workspacePath) : "—",
      sessionIdLabel: currentSessionLabel,
      onOpenExplorer: openSidebar,
      sidebarVisible,
    },
    conversation: {
      messages: sseState.messages,
      provider: themeState.provider,
      permissionDenials: sseState.permissionDenials ?? [],
      lastSessionTerminated: sseState.lastSessionTerminated,
      sessionId: sseState.sessionId,
      tailBoxMaxHeight: sseState.tailBoxMaxHeight,
      scrollViewRef: sseState.scrollViewRef,
      onContentSizeChange: sseState.onContentSizeChange,
      onOpenUrl: chatActionState.onOpenPreviewInApp,
      onFileSelect: onChatFileSelect,
      onRetryPermission: chatActionState.onRetryPermission,
      onDismissPermission: sseState.dismissPermission,
      isSessionLoading: sseState.isSessionLoading,
    },
    fileViewer: {
      selectedFilePath: workspaceState.selectedFilePath,
      fileContent: workspaceState.fileContent,
      fileIsImage: workspaceState.fileIsImage,
      fileLoading: workspaceState.fileLoading,
      fileError: workspaceState.fileError,
      onCloseFileViewer: workspaceState.onCloseFileViewer,
      onAddCodeReference: chatActionState.onAddCodeReference,
    },
    sidebar: {
      visible: sidebarVisible,
      activeTab: sidebarActiveTab,
      onCloseSidebar: closeSidebar,
      onFileSelectFromSidebar: (path: string) => {
        workspaceState.onFileSelectFromSidebar(path);
        closeSidebar();
      },
      onCommitByAI: chatActionState.onCommitByAI,
      onSidebarTabChange: setSidebarActiveTab,
    },
    inputDock: {
      visible: !sidebarVisible || sidebarActiveTab === "files",
      serverBaseUrl: serverConfig.getBaseUrl(),
      pendingCodeRefs: chatActionState.pendingCodeRefs,
      onSubmitPrompt: chatActionState.onSubmitPrompt,
      onRemoveCodeRef: chatActionState.onRemoveCodeRef,
      onTerminateAgent: sseState.terminateAgent,
      onOpenWebPreview: chatActionState.onOpenWebPreview,
      onProviderChange: sseState.handleProviderChange,
      onModelChange: sseState.handleModelChange,
    },
    modals: {
      askQuestion: {
        pendingAskQuestion: sseState.pendingAskQuestion,
        onSubmitAskQuestion: chatActionState.onAskQuestionSubmit,
        onCancelAskQuestion: chatActionState.onAskQuestionCancel,
      },
      skills: {
        serverBaseUrl: serverConfig.getBaseUrl(),
      },
      workspacePicker: {
        workspacePath: workspaceState.workspacePath,
        onRefreshWorkspace: workspaceState.fetchWorkspacePath,
        onWorkspaceSelected: onWorkspaceSelectedFromPicker,
      },
      docker: {
        serverBaseUrl: serverConfig.getBaseUrl(),
      },
      modelPicker: {
        currentServerUrl: serverConfig.getBaseUrl(),
        onModelProviderChange: sseState.handleProviderChange,
        onModelChange: sseState.handleModelChange,
      },
      processes: {
        serverBaseUrl: serverConfig.getBaseUrl(),
        onOpenUrl: chatActionState.onOpenPreviewInApp,
      },
      sessionManagement: {
        serverBaseUrl: serverConfig.getBaseUrl(),
        onRefreshSessionManagementWorkspace: workspaceState.fetchWorkspacePath,
        workspacePathForSessionManagement: workspaceState.workspacePath,
        onSelectSession: sseState.handleSelectSession,
        onNewSession: sseState.handleNewSession,
        currentSessionId: sseState.sessionId,
        workspaceLoading: workspaceState.workspacePathLoading,
        sessionRunning: sseState.sessionRunning,
        onSelectActiveChat: sseState.handleSelectActiveChat,
        showActiveChat: false,
      },
      preview: {
        previewVisible: chatActionState.previewUrl != null,
        previewUrl: chatActionState.previewUrl ?? "",
        onClosePreview: chatActionState.onClosePreview,
        resolvePreviewUrl: serverConfig.resolvePreviewUrl,
      },
    },
  };
}
