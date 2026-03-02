import { InputPanel } from "@/components/chat/InputPanel";
import type { CodeRefPayload } from "@/components/file/FileViewerModal";
import type { Provider as BrandProvider } from "@/core/modelOptions";
import React from "react";

type ModelOption = {
  value: string;
  label: string;
};

type ChatInputDockProps = {
  connected: boolean;
  sessionRunning: boolean;
  waitingForUserInput: boolean;
  onSubmit: (prompt: string) => void;
  pendingCodeRefs: CodeRefPayload[];
  onRemoveCodeRef: (index: number) => void;
  onTerminateAgent: () => void;
  onOpenProcesses: () => void;
  onOpenWebPreview: () => void;
  provider: BrandProvider;
  model: string;
  modelOptions: ModelOption[];
  onOpenModelPicker: () => void;
  onOpenSkillsConfig: () => void;
  onOpenDocker: () => void;
  serverBaseUrl: string;
  isAutoApproveToolConfirm: boolean;
  onAutoApproveToolConfirmChange: (next: boolean) => void;
};

export function ChatInputDock({
  connected,
  sessionRunning,
  waitingForUserInput,
  onSubmit,
  pendingCodeRefs,
  onRemoveCodeRef,
  onTerminateAgent,
  onOpenProcesses,
  onOpenWebPreview,
  provider,
  model,
  modelOptions,
  onOpenModelPicker,
  onOpenSkillsConfig,
  onOpenDocker,
  serverBaseUrl,
  isAutoApproveToolConfirm,
  onAutoApproveToolConfirmChange,
}: ChatInputDockProps) {
  return (
      <InputPanel
      connected={connected}
      sessionRunning={sessionRunning}
      waitingForUserInput={waitingForUserInput}
      permissionMode="auto_edit"
      onSubmit={onSubmit}
      pendingCodeRefs={pendingCodeRefs}
      onRemoveCodeRef={onRemoveCodeRef}
      onTerminateAgent={onTerminateAgent}
      onOpenProcesses={onOpenProcesses}
      onOpenWebPreview={onOpenWebPreview}
      provider={provider}
      model={model}
      modelOptions={modelOptions}
      onOpenModelPicker={onOpenModelPicker}
      onOpenSkillsConfig={onOpenSkillsConfig}
      onOpenDocker={onOpenDocker}
      serverBaseUrl={serverBaseUrl}
      isAutoApproveToolConfirm={isAutoApproveToolConfirm}
      onAutoApproveToolConfirmChange={onAutoApproveToolConfirmChange}
    />
  );
}
