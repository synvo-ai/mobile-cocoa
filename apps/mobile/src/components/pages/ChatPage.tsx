import { ChatModalsSection } from "@/components/chat/ChatModalsSection";
import type { CodeRefPayload } from "@/components/file/FileViewerModal";
import { SwipeablePageNavigator } from "@/components/navigation/SwipeablePageNavigator";
import { ChatPageShell } from "@/components/pages/ChatPageShell";
import { FileViewerPage } from "@/components/pages/FileViewerPage";
import { SessionManagementPage } from "@/components/pages/SessionManagementPage";
import { WorkspaceSidebarPage } from "@/components/pages/WorkspaceSidebarPage";
import type { createAppStyles } from "@/components/styles/appStyles";
import { Box } from "@/components/ui/box";
import type { Provider as BrandProvider } from "@/core/modelOptions";
import { EntranceAnimation } from "@/designSystem";
import type { Message, PendingAskUserQuestion, PermissionDenial } from "@/services/chat/hooks";
import type { getTheme } from "@/theme/index";
import React from "react";
import { ScrollView, StyleSheet } from "react-native";

type ModelOption = {
  value: string;
  label: string;
};

type ModalSessionItem = {
  id: string;
  provider?: string | null;
  model?: string | null;
  running?: boolean;
  sseConnected?: boolean;
  messages?: Message[];
  cwd?: string | null;
};

export type ChatPageContext = {
  theme: ReturnType<typeof getTheme>;
  themeMode: "light" | "dark";
  styles: ReturnType<typeof createAppStyles>;
  provider: BrandProvider;
  model: string;
  modelOptions: ModelOption[];
  providerModelOptions: Record<BrandProvider, ModelOption[]>;
};

export type ChatPageRuntime = {
  connected: boolean;
  permissionDenials: PermissionDenial[];
  lastSessionTerminated: boolean;
  tailBoxMaxHeight: number;
  sessionRunning: boolean;
  waitingForUserInput: boolean;
};

export type ChatPageHeader = {
  workspaceName: string;
  sessionIdLabel: string;
  onOpenExplorer: () => void;
  sidebarVisible: boolean;
};

export type ChatPageConversation = {
  messages: Message[];
  provider: BrandProvider;
  sessionId: string | null;
  permissionDenials: PermissionDenial[];
  lastSessionTerminated: boolean;
  tailBoxMaxHeight: number;
  scrollViewRef: React.RefObject<ScrollView | null>;
  onContentSizeChange: () => void;
  onOpenUrl: (url: string) => void;
  onFileSelect: (path: string) => void;
  onRetryPermission: () => void;
  onDismissPermission: () => void;
  isSessionLoading: boolean;
};

export type ChatPageFileViewer = {
  selectedFilePath: string | null;
  fileContent: string | null;
  fileIsImage: boolean;
  fileLoading: boolean;
  fileError: string | null;
  onCloseFileViewer: () => void;
  onAddCodeReference: (ref: CodeRefPayload) => void;
};

export type ChatPageSidebar = {
  visible: boolean;
  activeTab: "files" | "changes" | "commits";
  onCloseSidebar: () => void;
  onFileSelectFromSidebar: (path: string) => void;
  onCommitByAI: (userRequest: string) => void;
  onSidebarTabChange: (tab: "files" | "changes" | "commits") => void;
};

export type ChatPageInputDock = {
  visible: boolean;
  serverBaseUrl: string;
  pendingCodeRefs: CodeRefPayload[];
  onSubmitPrompt: (prompt: string) => void;
  onRemoveCodeRef: (index: number) => void;
  onTerminateAgent: () => void;
  onOpenWebPreview: () => void;
  isAutoApproveToolConfirm: boolean;
  onAutoApproveToolConfirmChange: (next: boolean) => void;
};

export type ChatPageAskQuestion = {
  pendingAskQuestion: PendingAskUserQuestion | null;
  onSubmitAskQuestion: (answers: Array<{ header: string; selected: string[] }>) => void;
  onCancelAskQuestion: () => void;
  onPermissionDecision: (approved: boolean) => void;
};

type ChatPageSkillsConfig = {
  serverBaseUrl: string;
};

type ChatPageWorkspacePicker = {
  workspacePath: string | null;
  onRefreshWorkspace: () => void;
  onWorkspaceSelected: (path?: string) => void;
};

type ChatPageDocker = {
  serverBaseUrl: string;
};

type ChatPagePortForwarding = {
  serverBaseUrl: string;
  isCloudflareMode: boolean;
  onApplied?: () => void;
};

type ChatPageModelPicker = {
  currentServerUrl: string;
  onModelProviderChange: (provider: BrandProvider) => void;
  onModelChange: (model: string) => void;
};

type ChatPageProcesses = {
  serverBaseUrl: string;
  onOpenUrl?: (url: string) => void;
};

type ChatPageSessionManagement = {
  onRefreshSessionManagementWorkspace: () => void;
  workspacePathForSessionManagement: string | null;
  serverBaseUrl: string;
  onSelectSession: (session: ModalSessionItem | null) => Promise<void> | void;
  onNewSession: () => void;
  currentSessionId: string | null;
  sessionRunning: boolean;
  onSelectActiveChat: () => void;
  showActiveChat: boolean;
};

type ChatPagePreview = {
  previewVisible: boolean;
  previewUrl: string;
  onClosePreview: () => void;
  resolvePreviewUrl: (url: string) => string;
};

export type ChatPageModals = {
  askQuestion: ChatPageAskQuestion;
  skills: ChatPageSkillsConfig;
  workspacePicker: ChatPageWorkspacePicker;
  docker: ChatPageDocker;
  portForwarding: ChatPagePortForwarding;
  modelPicker: ChatPageModelPicker;
  processes: ChatPageProcesses;
  sessionManagement: ChatPageSessionManagement;
  preview: ChatPagePreview;
  generalSettings: {
    isAutoApproveToolConfirm: boolean;
    onAutoApproveToolConfirmChange: (next: boolean) => void;
    connectionMode: string;
    workspacePath: string | null;
  };
};

export type ChatPageProps = {
  context: ChatPageContext;
  runtime: ChatPageRuntime;
  header: ChatPageHeader;
  conversation: ChatPageConversation;
  fileViewer: ChatPageFileViewer;
  sidebar: ChatPageSidebar;
  inputDock: ChatPageInputDock;
  modals: ChatPageModals;
};

export function ChatPage({
  context,
  runtime,
  header,
  conversation,
  fileViewer,
  sidebar,
  inputDock,
  modals,
}: ChatPageProps) {
  const isFileViewerOpen = fileViewer.selectedFilePath != null;

  return (
    <ChatModalsSection
      context={context}
      modals={modals}
      onSelectActiveChat={modals.sessionManagement.onSelectActiveChat}
    >
      {(modalHandlers) => {
        const mainContent = (
          <Box className="flex-1" style={{ backgroundColor: 'transparent' }}>
            {isFileViewerOpen ? (
              <FileViewerPage
                path={fileViewer.selectedFilePath!}
                content={fileViewer.fileContent}
                isImage={fileViewer.fileIsImage}
                loading={fileViewer.fileLoading}
                error={fileViewer.fileError}
                onClose={fileViewer.onCloseFileViewer}
                onAddCodeReference={fileViewer.onAddCodeReference}
              />
            ) : (
              <>
                <ChatPageShell
                  context={context}
                  runtime={runtime}
                  header={header}
                  conversation={conversation}
                  sidebar={sidebar}
                  inputDock={inputDock}
                  modalHandlers={modalHandlers}
                  portForwarding={modals.portForwarding}
                />

                {sidebar.visible && (
                  <EntranceAnimation
                    variant="slideLeft"
                    duration={250}
                    style={{ ...StyleSheet.absoluteFillObject }}
                  >
                    <WorkspaceSidebarPage
                      isOpen={sidebar.visible}
                      onClose={sidebar.onCloseSidebar}
                      onFileSelect={sidebar.onFileSelectFromSidebar}
                      onCommitByAI={sidebar.onCommitByAI}
                      onActiveTabChange={sidebar.onSidebarTabChange}
                    />
                  </EntranceAnimation>
                )}
              </>
            )}
          </Box>
        );

        const sessionPage = (
          <SessionManagementPage
            isOpen={modalHandlers.isSessionManagementOpen}
            onClose={modalHandlers.onCloseSessionManagement}
            currentSessionId={modals.sessionManagement.currentSessionId}
            workspacePath={modals.sessionManagement.workspacePathForSessionManagement}
            serverBaseUrl={modals.sessionManagement.serverBaseUrl}
            onOpenWorkspacePicker={modalHandlers.onOpenWorkspacePickerFromSession}
            onSelectSession={modalHandlers.onSessionSelect}
            onNewSession={modalHandlers.onNewSession}
            showActiveChat={modals.sessionManagement.showActiveChat}
            sessionRunning={modals.sessionManagement.sessionRunning}
            onSelectActiveChat={modalHandlers.onSelectActiveChat}
          />
        );

        return (
          <SwipeablePageNavigator
            isOpen={modalHandlers.isSessionManagementOpen}
            onOpen={modalHandlers.onOpenSessionManagement}
            onClose={modalHandlers.onCloseSessionManagement}
            mainPage={mainContent}
            overlayPage={sessionPage}
            swipeToOpenEnabled={!sidebar.visible && !isFileViewerOpen && !modalHandlers.isAnyNonSessionModalOpen}
          />
        );
      }}
    </ChatModalsSection>
  );
}
