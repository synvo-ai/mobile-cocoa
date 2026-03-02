import { AppHeaderBar } from "@/components/chat/AppHeaderBar";
import { ChatInputDock } from "@/components/chat/ChatInputDock";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import type { ChatPageContext, ChatPageConversation, ChatPageInputDock, ChatPageRuntime } from "@/components/pages/ChatPage";
import { Box } from "@/components/ui/box";
import React from "react";
import { ActivityIndicator, type LayoutChangeEvent } from "react-native";

export type ChatHeaderSectionProps = {
  onOpenExplorer: () => void;
  sidebarVisible: boolean;
  onOpenGeneralSettings?: () => void;
};

export function ChatHeaderSection({
  onOpenExplorer,
  sidebarVisible,
  onOpenGeneralSettings,
}: ChatHeaderSectionProps) {
  return (
    <AppHeaderBar
      visible={!sidebarVisible}
      onOpenExplorer={onOpenExplorer}
      onOpenGeneralSettings={onOpenGeneralSettings}
    />
  );
}

export type ChatConversationSectionProps = {
  conversation: ChatPageConversation;
  inputDockHeight: number;
  isHidden?: boolean;
};

function ChatSectionFrame({ children }: { children: React.ReactNode }) {
  return <Box className="flex-1 mt-0">{children}</Box>;
}

export function ChatConversationSection({ conversation, inputDockHeight, isHidden }: ChatConversationSectionProps) {
  return (
    <ChatSectionFrame>
      {!isHidden && (
        <Box className="flex-1 min-h-0 relative">
          <ChatMessageList
            messages={conversation.messages}
            provider={conversation.provider}
            sessionId={conversation.sessionId}
            permissionDenials={conversation.permissionDenials}
            lastSessionTerminated={conversation.lastSessionTerminated}
            onOpenUrl={conversation.onOpenUrl}
            onFileSelect={conversation.onFileSelect}
            onRetryPermission={conversation.onRetryPermission}
            onDismissPermission={conversation.onDismissPermission}
            tailBoxMaxHeight={conversation.tailBoxMaxHeight}
            scrollViewRef={conversation.scrollViewRef}
            onContentSizeChange={conversation.onContentSizeChange}
            style={{ flex: 1, minHeight: 0, opacity: conversation.isSessionLoading ? 0 : 1 }}
            contentContainerStyle={[{ paddingHorizontal: 12 }, { paddingBottom: inputDockHeight + 36 }]}
          />
          {conversation.isSessionLoading && (
            <Box className="absolute inset-0 items-center justify-center pointer-events-none" style={{ backgroundColor: "transparent" }}>
              <ActivityIndicator size="large" />
            </Box>
          )}
        </Box>
      )}
    </ChatSectionFrame>
  );
}

export type ChatInputDockSectionProps = {
  runtime: ChatPageRuntime;
  context: ChatPageContext;
  input: ChatPageInputDock;
  onOpenSkillsConfig: () => void;
  onOpenProcesses: () => void;
  onOpenDocker: () => void;
  onOpenPortForwarding: () => void;
  isCloudflareMode?: boolean;
  onOpenModelPicker: () => void;
  onInputDockLayout: (height: number) => void;
};

export function ChatInputDockSection({
  runtime,
  context,
  input,
  onOpenSkillsConfig,
  onOpenProcesses,
  onOpenDocker,
  onOpenPortForwarding,
  isCloudflareMode,
  onOpenModelPicker,
  onInputDockLayout,
}: ChatInputDockSectionProps) {
  if (!input.visible) {
    return null;
  }

  return (
    <Box
      className="absolute bottom-0 w-full pb-2 z-10"
      onLayout={(event: LayoutChangeEvent) => {
        const height = event.nativeEvent.layout.height;
        onInputDockLayout(height);
      }}
    >
      <ChatInputDock
        connected={runtime.connected}
        sessionRunning={runtime.sessionRunning}
        waitingForUserInput={runtime.waitingForUserInput}
        onSubmit={input.onSubmitPrompt}
        pendingCodeRefs={input.pendingCodeRefs}
        onRemoveCodeRef={input.onRemoveCodeRef}
        onTerminateAgent={input.onTerminateAgent}
        onOpenProcesses={onOpenProcesses}
        onOpenWebPreview={input.onOpenWebPreview}
        isAutoApproveToolConfirm={input.isAutoApproveToolConfirm}
        onAutoApproveToolConfirmChange={input.onAutoApproveToolConfirmChange}
        provider={context.provider}
        model={context.model}
        modelOptions={context.modelOptions}
        onOpenModelPicker={onOpenModelPicker}
        onOpenSkillsConfig={onOpenSkillsConfig}
        onOpenDocker={onOpenDocker}
        onOpenPortForwarding={onOpenPortForwarding}
        isCloudflareMode={isCloudflareMode}
        serverBaseUrl={input.serverBaseUrl}
      />
    </Box>
  );
}
