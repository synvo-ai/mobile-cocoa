import type { ChatPageContext, ChatPageConversation, ChatPageFileViewer, ChatPageHeader, ChatPageInputDock, ChatPageRuntime, ChatPageSidebar } from "@/components/pages/ChatPage";
import { ChatConversationSection, ChatHeaderSection, ChatInputDockSection } from "@/components/pages/ChatPageSections";
import { layoutOuterStyle } from "@/components/styles/appStyles";
import type { ChatModalOpenHandlers } from "@/components/types/chatModalTypes";
import { Box } from "@/components/ui/box";
import { KeyboardAvoidingView } from "@/components/ui/keyboard-avoiding-view";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export type ChatPageShellProps = {
  context: ChatPageContext;
  runtime: ChatPageRuntime;
  header: ChatPageHeader;
  conversation: ChatPageConversation;
  fileViewer: ChatPageFileViewer;
  sidebar: ChatPageSidebar;
  inputDock: ChatPageInputDock;
  modalHandlers: ChatModalOpenHandlers;
};

export function ChatPageShell({
  context,
  runtime,
  header,
  conversation,
  fileViewer,
  sidebar,
  inputDock,
  modalHandlers,
}: ChatPageShellProps) {
  const insets = useSafeAreaInsets();
  const [inputDockHeight, setInputDockHeight] = useState(0);
  const isAnyOverlayOpen = modalHandlers.isAnyModalOpen || sidebar.visible;
  const shouldShowInputDock = inputDock.visible && !isAnyOverlayOpen;

  const handleInputDockLayout = useCallback((height: number) => {
    setInputDockHeight(height);
  }, []);

  const isDark = context.theme.mode === "dark";

  return (
    <Box className="flex-1" style={layoutOuterStyle}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right", "bottom"]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <Box className="flex-1 flex-col px-6 pt-0">
            <Box className="relative flex-1 min-h-0" style={{ overflow: "hidden" }}>
              <Box className="flex-1 min-h-0" style={{ overflow: "hidden" }}>
                {!isAnyOverlayOpen && (
                  <ChatHeaderSection
                    theme={context.theme}
                    onOpenExplorer={header.onOpenExplorer}
                    onOpenSessionManagement={modalHandlers.onOpenSessionManagement}
                    sidebarVisible={header.sidebarVisible || modalHandlers.isAnyModalOpen}
                  />
                )}
                <ChatConversationSection
                  conversation={conversation}
                  inputDockHeight={shouldShowInputDock ? inputDockHeight : 0}
                  isHidden={isAnyOverlayOpen}
                />
              </Box>
              <ChatInputDockSection
                runtime={runtime}
                context={context}
                input={{ ...inputDock, visible: shouldShowInputDock }}
                onOpenSkillsConfig={modalHandlers.onOpenSkillsConfig}
                onOpenProcesses={modalHandlers.onOpenProcesses}
                onOpenDocker={modalHandlers.onOpenDocker}
                onOpenModelPicker={modalHandlers.onOpenModelPicker}
                onInputDockLayout={handleInputDockLayout}
              />
            </Box>
          </Box>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Box>
  );
}
