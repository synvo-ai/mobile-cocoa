import "./global.css";

import React, { memo, useCallback, useMemo } from "react";

import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import { getDefaultServerConfig } from "@/core";
import { ThemeProvider } from "@/theme/index";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { ImageBackground, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ChatActionController, type ChatActionControllerState } from "@/components/controllers/ChatActionController";
import { useSessionSideEffects } from "@/components/controllers/SessionSideEffectManager";
import { SseSessionController, type SseSessionControllerState } from "@/components/controllers/SseSessionController";
import { ThemeSessionState, type ThemeSessionStateState } from "@/components/controllers/ThemeSessionState";
import { WorkspaceFileController, type WorkspaceFileControllerState } from "@/components/controllers/WorkspaceFileController";
import { useSidebarState, type SidebarState } from "@/components/hooks/useSidebarState";
import { buildChatPageProps } from "@/components/pages/buildChatPageProps";
import { ChatPage } from "@/components/pages/ChatPage";
import type { IServerConfig } from "@/core/types";
import { useThemeAssets } from "@/hooks/useThemeAssets";

const AppBackground = memo(function AppBackground() {
  const assets = useThemeAssets();
  return (
    <ImageBackground
      source={assets.background}
      style={StyleSheet.absoluteFill}
      resizeMode="stretch"
    />
  );
});

/**
 * Extracted from the ChatActionController render-prop so that hooks
 * (useCallback, useMemo, useSessionSideEffects) are called at the
 * top level of a React component rather than inside a callback.
 */
const AppInner = memo(function AppInner({
  themeState,
  sseState,
  workspaceState,
  chatActionState,
  sidebarState,
  serverConfig,
}: {
  themeState: ThemeSessionStateState;
  sseState: SseSessionControllerState;
  workspaceState: WorkspaceFileControllerState;
  chatActionState: ChatActionControllerState;
  sidebarState: SidebarState;
  serverConfig: Pick<IServerConfig, "getBaseUrl" | "resolvePreviewUrl">;
}) {
  const onChatFileSelect = useCallback((path: string) => {
    sidebarState.openSidebar();
    workspaceState.onFileSelectFromChat(path);
  }, [sidebarState.openSidebar, workspaceState.onFileSelectFromChat]);

  const onWorkspaceSelected = useCallback((path?: string) => {
    sseState.resetSession();
    workspaceState.onWorkspaceSelectedFromPicker(path);
  }, [sseState.resetSession, workspaceState.onWorkspaceSelectedFromPicker]);

  const chatPageProps = useMemo(
    () =>
      buildChatPageProps({
        themeState,
        sseState,
        workspaceState,
        chatActionState,
        sidebarVisible: sidebarState.sidebarVisible,
        sidebarActiveTab: sidebarState.sidebarActiveTab,
        setSidebarActiveTab: sidebarState.setSidebarActiveTab,
        openSidebar: sidebarState.openSidebar,
        closeSidebar: sidebarState.closeSidebar,
        onChatFileSelect,
        onWorkspaceSelectedFromPicker: onWorkspaceSelected,
        serverConfig,
      }),
    [
      themeState,
      sseState,
      workspaceState,
      chatActionState,
      sidebarState.sidebarVisible,
      sidebarState.sidebarActiveTab,
      sidebarState.setSidebarActiveTab,
      sidebarState.openSidebar,
      sidebarState.closeSidebar,
      onChatFileSelect,
      onWorkspaceSelected,
      serverConfig,
    ]
  );

  useSessionSideEffects({
    serverConfig,
    sseState,
    themeState,
    workspacePath: workspaceState.workspacePath,
  });

  return (
    <ThemeProvider mode={themeState.themeMode}>
      <GluestackUIProvider mode={themeState.themeMode}>
        <BottomSheetModalProvider>
          <View style={{ flex: 1 }}>
            <AppBackground />
            <ChatPage {...chatPageProps} />
          </View>
        </BottomSheetModalProvider>
      </GluestackUIProvider>
    </ThemeProvider>
  );
});

export default function App() {
  const serverConfig = useMemo(() => getDefaultServerConfig(), []);
  const [isAutoApproveToolConfirm, setIsAutoApproveToolConfirm] = React.useState(true);
  const sidebarState = useSidebarState();
  const memoizedSidebarState = useMemo(
    () => ({
      sidebarVisible: sidebarState.sidebarVisible,
      sidebarActiveTab: sidebarState.sidebarActiveTab,
      openSidebar: sidebarState.openSidebar,
      closeSidebar: sidebarState.closeSidebar,
      setSidebarActiveTab: sidebarState.setSidebarActiveTab,
    }),
    [
      sidebarState.sidebarVisible,
      sidebarState.sidebarActiveTab,
      sidebarState.openSidebar,
      sidebarState.closeSidebar,
      sidebarState.setSidebarActiveTab,
    ]
  );
  const renderChatAction = useCallback(
    (
      themeState: ThemeSessionStateState,
      sseState: SseSessionControllerState,
      workspaceState: WorkspaceFileControllerState,
      chatActionState: ChatActionControllerState
    ) => (
      <AppInner
        themeState={themeState}
        sseState={sseState}
        workspaceState={workspaceState}
        chatActionState={chatActionState}
        sidebarState={memoizedSidebarState}
        serverConfig={serverConfig}
      />
    ),
    [serverConfig, memoizedSidebarState]
  );

  const renderSse = useCallback(
    (
      themeState: ThemeSessionStateState,
      workspaceState: WorkspaceFileControllerState,
      sseState: SseSessionControllerState
    ) => (
      <ChatActionController
        provider={themeState.provider}
        sessionId={sseState.sessionId}
        messages={sseState.messages}
        submitPrompt={sseState.submitPrompt}
        submitAskQuestionAnswer={sseState.submitAskQuestionAnswer}
        submitPermissionDecision={sseState.submitPermissionDecision}
        dismissAskQuestion={sseState.dismissAskQuestion}
        retryAfterPermission={sseState.retryAfterPermission}
        isAutoApproveToolConfirm={isAutoApproveToolConfirm}
        onAutoApproveToolConfirmChange={setIsAutoApproveToolConfirm}
        closeFileViewer={workspaceState.onCloseFileViewer}
        resetSession={sseState.resetSession}
        onSubmitSideEffects={() => {
          memoizedSidebarState.closeSidebar();
          workspaceState.onCloseFileViewer();
        }}
      >
        {(chatActionState) =>
          renderChatAction(themeState, sseState, workspaceState, chatActionState)
        }
      </ChatActionController>
    ),
    [isAutoApproveToolConfirm, memoizedSidebarState.closeSidebar, renderChatAction]
  );

  const renderWorkspace = useCallback(
    (themeState: ThemeSessionStateState) => (
      <WorkspaceFileController serverConfig={serverConfig}>
        {(workspaceState) => (
          <SseSessionController
            provider={themeState.provider}
            model={themeState.model}
            serverConfig={serverConfig}
            setModel={themeState.setModel}
            setProvider={themeState.setProvider}
            switchWorkspaceForSession={workspaceState.switchWorkspaceForSession}
          >
            {(sseState) => renderSse(themeState, workspaceState, sseState)}
          </SseSessionController>
        )}
      </WorkspaceFileController>
    ),
    [renderSse, serverConfig]
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeSessionState>{renderWorkspace}</ThemeSessionState>
    </GestureHandlerRootView>
  );
}
