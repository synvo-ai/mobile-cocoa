import React from "react";

import { AskQuestionModal } from "@/components/chat/AskQuestionModal";
import { ModelPickerSheet } from "@/components/chat/ModelPickerSheet";
import { DockerManagerModal } from "@/components/docker/DockerManagerModal";
import { useChatModalsController } from "@/components/hooks/useChatModalsController";
import type { ChatPageContext, ChatPageModals } from "@/components/pages/ChatPage";
import { PortForwardingModal } from "@/components/ports/PortForwardingModal";
import { PreviewWebViewModal } from "@/components/preview/PreviewWebViewModal";
import { ProcessDashboardModal } from "@/components/processes/ProcessDashboardModal";
import { SkillConfigurationView } from "@/components/settings/SkillConfigurationView";
import { WorkspacePickerModal } from "@/components/settings/WorkspacePickerModal";
import type { ChatModalOpenHandlers } from "@/components/types/chatModalTypes";
import { Box } from "@/components/ui/box";
import { GeneralSettingsModal } from "@/components/settings/GeneralSettingsModal";

type ChatModalsSectionProps = {
  context: ChatPageContext;
  modals: ChatPageModals;
  onSelectActiveChat: () => void;
  children: (open: ChatModalOpenHandlers) => React.ReactNode;
};

export function ChatModalsSection({
  context,
  modals,
  onSelectActiveChat,
  children,
}: ChatModalsSectionProps) {
  const {
    openHandlers,
    modalStates,
    selectedSkillId,
    handleSessionSelect,
    handleNewSession,
    handleSelectActiveChat,
    handleWorkspacePickerFromSession,
    handleWorkspaceSelected,
    handleModelChange,
    handleSelectSkill,
    closeSkillsConfig,
    closeSkillDetail,
    handleModelProviderChange,
  } = useChatModalsController({
    onRefreshSessionManagementWorkspace: modals.sessionManagement.onRefreshSessionManagementWorkspace,
    onSessionManagementSelect: modals.sessionManagement.onSelectSession,
    onSessionManagementNewSession: modals.sessionManagement.onNewSession,
    onSessionManagementActiveChat: onSelectActiveChat,
    onWorkspaceSelected: modals.workspacePicker.onWorkspaceSelected,
    onModelProviderChange: modals.modelPicker.onModelProviderChange,
    onModelChange: modals.modelPicker.onModelChange,
  });

  const isAnyModalOpen =
    openHandlers.isAnyModalOpen ||
    modals.askQuestion.pendingAskQuestion != null ||
    modals.preview.previewVisible;

  const isSkillsConfigOpen = modalStates.skillsConfig.isOpen;

  // Non-session-management modals (used to disable swipe gesture when other modals are open)
  const isAnyNonSessionModalOpen =
    modalStates.workspacePicker.isOpen ||
    modalStates.skillsConfig.isOpen ||
    modalStates.docker.isOpen ||
    modalStates.portForwarding.isOpen ||
    modalStates.modelPicker.isOpen ||
    modalStates.generalSettings.isOpen ||
    modals.askQuestion.pendingAskQuestion != null ||
    modals.preview.previewVisible;

  const fullHandlers: ChatModalOpenHandlers = {
    ...openHandlers,
    isAnyModalOpen,
    isAnyNonSessionModalOpen,
    onCloseSessionManagement: modalStates.sessionManagement.close,
    onOpenWorkspacePickerFromSession: handleWorkspacePickerFromSession,
    onSessionSelect: handleSessionSelect,
    onNewSession: handleNewSession,
    onSelectActiveChat: handleSelectActiveChat,
  };

  return (
    <>
      {isSkillsConfigOpen ? (
        <Box className="flex-1">
          <SkillConfigurationView
            isOpen
            presentation="inline"
            onClose={closeSkillsConfig}
            onSelectSkill={handleSelectSkill}
            selectedSkillId={selectedSkillId}
            onCloseSkillDetail={closeSkillDetail}
            serverBaseUrl={modals.skills.serverBaseUrl}
          />
        </Box>
      ) : (
        children(fullHandlers)
      )}
      <WorkspacePickerModal
        isOpen={modalStates.workspacePicker.isOpen}
        onClose={modalStates.workspacePicker.close}
        serverBaseUrl={modals.modelPicker.currentServerUrl}
        workspacePath={modals.workspacePicker.workspacePath}
        onRefreshWorkspace={modals.workspacePicker.onRefreshWorkspace}
        onWorkspaceSelected={handleWorkspaceSelected}
      />
      <ProcessDashboardModal isOpen={modalStates.processes.isOpen} onClose={modalStates.processes.close} serverBaseUrl={modals.processes.serverBaseUrl} onOpenUrl={modals.processes.onOpenUrl} />
      <DockerManagerModal isOpen={modalStates.docker.isOpen} onClose={modalStates.docker.close} serverBaseUrl={modals.docker.serverBaseUrl} />
      {modals.portForwarding.isCloudflareMode && (
        <PortForwardingModal
          isOpen={modalStates.portForwarding.isOpen}
          onClose={modalStates.portForwarding.close}
          serverBaseUrl={modals.portForwarding.serverBaseUrl}
          onApplied={modals.portForwarding.onApplied}
        />
      )}
      <ModelPickerSheet
        isOpen={modalStates.modelPicker.isOpen}
        onClose={modalStates.modelPicker.close}
        provider={context.provider}
        model={context.model}
        themeMode={context.themeMode}
        providerModelOptions={context.providerModelOptions}
        onProviderChange={handleModelProviderChange}
        onModelChange={handleModelChange}
      />
      <AskQuestionModal
        pending={modals.askQuestion.pendingAskQuestion}
        onSubmit={modals.askQuestion.onSubmitAskQuestion}
        onCancel={modals.askQuestion.onCancelAskQuestion}
        onPermissionDecision={modals.askQuestion.onPermissionDecision}
      />
      <PreviewWebViewModal
        isOpen={modals.preview.previewVisible}
        url={modals.preview.previewUrl}
        title="Preview"
        onClose={modals.preview.onClosePreview}
        resolvePreviewUrl={modals.preview.resolvePreviewUrl}
      />
      <GeneralSettingsModal
        isOpen={modalStates.generalSettings.isOpen}
        onClose={modalStates.generalSettings.close}
        connectionMode={modals.generalSettings.connectionMode as any}
        workspacePath={modals.generalSettings.workspacePath}
        onOpenPortForwarding={modals.portForwarding.isCloudflareMode ? openHandlers.onOpenPortForwarding : undefined}
      />
    </>
  );
}

