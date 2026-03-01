import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, InteractionManager, ScrollView } from "react-native";

import { type Provider } from "@/core/modelOptions";
import { triggerHaptic } from "@/design-system";
import { getModel, ModalSessionItem } from "@/features/app/appConfig";
import { useChat, type Message, type PendingAskUserQuestion, type PermissionDenial } from "@/services/chat/hooks";
import * as sessionStore from "@/services/sessionStore";
import { useSessionManagementStore, type SessionStatus } from "@/state/sessionManagementStore";

export type SseSessionControllerProps = {
  provider: Provider;
  model: string;
  serverConfig: {
    getBaseUrl: () => string;
  };
  setModel: (model: string) => void;
  setProvider: (provider: Provider) => void;
  switchWorkspaceForSession?: (workspacePath: string) => Promise<void>;
  children: (state: SseSessionControllerState) => React.ReactNode;
};

export type SseSessionControllerState = {
  connected: boolean;
  isSessionLoading: boolean;
  messages: Message[];
  sessionRunning: boolean;
  waitingForUserInput: boolean;
  permissionDenials: PermissionDenial[] | null;
  lastSessionTerminated: boolean;
  sessionId: string | null;
  pendingAskQuestion: PendingAskUserQuestion | null;
  submitPrompt: ReturnType<typeof useChat>["submitPrompt"];
  submitAskQuestionAnswer: ReturnType<typeof useChat>["submitAskQuestionAnswer"];
  dismissAskQuestion: ReturnType<typeof useChat>["dismissAskQuestion"];
  retryAfterPermission: ReturnType<typeof useChat>["retryAfterPermission"];
  dismissPermission: ReturnType<typeof useChat>["dismissPermission"];
  terminateAgent: ReturnType<typeof useChat>["terminateAgent"];
  resetSession: ReturnType<typeof useChat>["resetSession"];
  loadSession: ReturnType<typeof useChat>["loadSession"];
  startNewSession: ReturnType<typeof useChat>["startNewSession"];
  tailBoxMaxHeight: number;
  scrollViewRef: React.RefObject<ScrollView | null>;
  onContentSizeChange: () => void;
  sessionStatuses: SessionStatus[];
  setSessionStatuses: (sessions: SessionStatus[]) => void;
  storeProvider: string | null;
  storeModel: string | null;
  storeSessionId: string | null;
  handleModelChange: (model: string) => void;
  handleProviderChange: (provider: Provider) => void;
  handleSelectSession: (session: ModalSessionItem | null) => Promise<void>;
  handleSelectActiveChat: () => void;
  handleNewSession: () => void;
};

export function SseSessionController({
  provider,
  model,
  serverConfig,
  setModel,
  setProvider,
  switchWorkspaceForSession,
  children,
}: SseSessionControllerProps) {
  const storeSessionId = useSessionManagementStore((state) => state.sessionId);
  const setGlobalSessionId = useSessionManagementStore((state) => state.setSessionId);
  const setGlobalProvider = useSessionManagementStore((state) => state.setProvider);
  const setGlobalModel = useSessionManagementStore((state) => state.setModel);
  const storeProvider = useSessionManagementStore((state) => state.provider);
  const storeModel = useSessionManagementStore((state) => state.model);
  const sessionStatuses = useSessionManagementStore((state) => state.sessionStatuses);
  const setSessionStatuses = useSessionManagementStore((state) => state.setSessionStatuses);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(false);
  const sessionSwitchLockRef = useRef(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [waitingForUserInput, setWaitingForUserInput] = useState(false);
  const [permissionDenials, setPermissionDenials] = useState<PermissionDenial[] | null>(null);
  const [lastSessionTerminated, setLastSessionTerminated] = useState(false);
  const [pendingAskQuestion, setPendingAskQuestion] = useState<PendingAskUserQuestion | null>(null);
  const {
    sessionId,
    submitPrompt,
    submitAskQuestionAnswer,
    dismissAskQuestion,
    retryAfterPermission,
    dismissPermission,
    terminateAgent,
    resetSession,
    startNewSession,
    loadSession,
  } = useChat({
    provider,
    model,
    onConnectedChange: setConnected,
    onSessionRunningChange: setSessionRunning,
    onMessagesChange: setMessages,
    onWaitingForUserInputChange: setWaitingForUserInput,
    onPermissionDenialsChange: setPermissionDenials,
    onLastSessionTerminatedChange: setLastSessionTerminated,
    onPendingAskQuestionChange: setPendingAskQuestion,
  });

  useEffect(() => {
    setGlobalProvider(provider);
    setGlobalModel(model);
    setGlobalSessionId(sessionId);
  }, [provider, model, sessionId, setGlobalProvider, setGlobalModel, setGlobalSessionId]);

  const hasRestoredProviderModel = useRef(false);
  useEffect(() => {
    if (hasRestoredProviderModel.current) return;
    hasRestoredProviderModel.current = true;
    sessionStore
      .loadLastUsedProviderModel()
      .then((lastUsed) => {
        if (lastUsed) {
          setModel(lastUsed.model);
        }
      })
      .catch(() => {
        // Ignore restore failures.
      });
  }, [setModel]);

  useEffect(() => {
    sessionStore.setLastUsedProviderModel(provider, model);
  }, [provider, model]);

  const tailBoxMaxHeight = useMemo(() => Dimensions.get("window").height * 0.5, []);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastScrollToEndTimeRef = useRef(0);

  useEffect(() => {
    if (messages.length > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const scrollToEnd = useCallback((animated = true) => {
    scrollViewRef.current?.scrollToEnd({ animated });
  }, []);

  const onContentSizeChange = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollToEndTimeRef.current < 400) {
      return;
    }
    lastScrollToEndTimeRef.current = now;
    scrollToEnd(true);
  }, [scrollToEnd]);

  const runAfterInteractionScroll = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 100);
    });
  }, []);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      if (nextModel === model) {
        return;
      }
      resetSession();
      setModel(nextModel);
      sessionStore.setLastUsedProviderModel(provider, nextModel);
      triggerHaptic("selection");
    },
    [model, provider, resetSession, setModel]
  );

  const handleProviderChange = useCallback(
    (nextProvider: Provider) => {
      if (nextProvider === provider) {
        return;
      }
      resetSession();
      setProvider(nextProvider);
      triggerHaptic("selection");
    },
    [provider, resetSession, setProvider]
  );

  const handleSelectSession = useCallback(
    async (session: ModalSessionItem | null) => {
      if (!session || typeof session.id !== "string" || session.id.length === 0) {
        return;
      }
      // Prevent concurrent session switches (double-tap guard)
      if (sessionSwitchLockRef.current) return;
      sessionSwitchLockRef.current = true;
      setIsSessionLoading(true);

      // Let React render the loading state
      await new Promise(resolve => setTimeout(resolve, 10));

      try {
        const selectedProvider = (typeof session.provider === "string" && session.provider.length > 0 ? session.provider : "codex") as Provider;
        const selectedModel =
          typeof session.model === "string" && session.model.length > 0 ? session.model : getModel(selectedProvider);
        let sessionMessages = Array.isArray(session.messages) ? session.messages : [];
        const sessionWorkspace =
          typeof session.cwd === "string" && session.cwd.trim().length > 0 ? session.cwd.trim() : null;

        if (sessionWorkspace) {
          await switchWorkspaceForSession?.(sessionWorkspace);
        }

        // Pre-fetch messages from server to avoid showing an empty chat flash
        if (sessionMessages.length === 0 && session.id) {
          try {
            const baseUrl = serverConfig.getBaseUrl();
            const res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(session.id)}/messages`);
            if (res.ok) {
              const data = await res.json();
              sessionMessages = Array.isArray(data?.messages) ? data.messages : [];
            }
          } catch {
            // Fall through with empty messages — loadSession will handle it
          }
        }

        if (selectedModel) {
          setModel(selectedModel);
        }
        setProvider(selectedProvider);

        sessionStore.setLastUsedProviderModel(selectedProvider, selectedModel);

        loadSession(sessionMessages, session.id, session.running || session.sseConnected);
      } finally {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            setIsSessionLoading(false);
            sessionSwitchLockRef.current = false;
            scrollViewRef.current?.scrollToEnd({ animated: false });
          }, 100);
        });
      }
    },
    [
      loadSession,
      serverConfig,
      setModel,
      setProvider,
      switchWorkspaceForSession,
    ]
  );

  const handleSelectActiveChat = useCallback(() => {
    runAfterInteractionScroll();
  }, [runAfterInteractionScroll]);

  const handleNewSession = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

  const state: SseSessionControllerState = {
    connected,
    isSessionLoading,
    messages,
    sessionRunning,
    waitingForUserInput,
    permissionDenials,
    lastSessionTerminated,
    sessionId,
    pendingAskQuestion,
    submitPrompt,
    submitAskQuestionAnswer,
    dismissAskQuestion,
    retryAfterPermission,
    dismissPermission,
    terminateAgent,
    resetSession,
    loadSession,
    startNewSession,
    tailBoxMaxHeight,
    scrollViewRef,
    onContentSizeChange,
    sessionStatuses,
    setSessionStatuses,
    storeProvider,
    storeModel,
    storeSessionId,
    handleModelChange,
    handleProviderChange,
    handleSelectSession,
    handleSelectActiveChat,
    handleNewSession,
  };

  return <>{children(state)}</>;
}
