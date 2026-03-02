import { useEffect, useRef } from "react";

import type { SseSessionControllerState } from "@/components/controllers/SseSessionController";
import type { ThemeSessionStateState } from "@/components/controllers/ThemeSessionState";
import { getDefaultServerConfig } from "@/core";
import { usePerformanceMonitor } from "@/designSystem";
import { useSessionManagementSync } from "@/features/app/useSessionManagementSync";
import { notifyAgentFinished, notifyApprovalNeeded } from "@/services/agentNotifications";

type SessionManagerServerConfig = ReturnType<typeof getDefaultServerConfig>;

export type SessionSideEffectManagerInput = {
  serverConfig: SessionManagerServerConfig;
  sseState: SseSessionControllerState;
  themeState: ThemeSessionStateState;
  workspacePath: string | null;
};

function useAgentFinishedSideEffect({
  sessionRunning,
  sessionId,
  serverConfig,
}: {
  sessionRunning: boolean;
  sessionId: string | null;
  serverConfig: SessionManagerServerConfig;
}): void {
  const prevSessionRunningRef = useRef(false);

  useEffect(() => {
    if (prevSessionRunningRef.current && !sessionRunning) {
      void notifyAgentFinished();
      if (sessionId && !sessionId.startsWith("temp-")) {
        const baseUrl = serverConfig.getBaseUrl();
        fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/finished`, { method: "POST" }).catch(() => {});
      }
    }
    prevSessionRunningRef.current = sessionRunning;
  }, [sessionRunning, sessionId, serverConfig]);
}

function useApprovalNeededSideEffect({
  pendingAskQuestion,
  waitingForUserInput,
  permissionDenials,
  sessionStatuses,
  activeSessionId,
}: {
  pendingAskQuestion: SessionSideEffectManagerInput["sseState"]["pendingAskQuestion"];
  waitingForUserInput: SessionSideEffectManagerInput["sseState"]["waitingForUserInput"];
  permissionDenials: SessionSideEffectManagerInput["sseState"]["permissionDenials"];
  sessionStatuses: SessionSideEffectManagerInput["sseState"]["sessionStatuses"];
  activeSessionId: string | null;
}): void {
  const prevApprovalNeededRef = useRef(false);
  const prevBackgroundWaitingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const approvalNeeded =
      pendingAskQuestion != null ||
      waitingForUserInput ||
      (permissionDenials != null && permissionDenials.length > 0);

    if (approvalNeeded && !prevApprovalNeededRef.current) {
      const firstQuestion = pendingAskQuestion?.questions?.[0];
      const title =
        typeof (firstQuestion?.header ?? firstQuestion?.question) === "string"
          ? (firstQuestion?.header ?? firstQuestion?.question)
          : permissionDenials && permissionDenials.length > 0
            ? "Permission decision needed"
            : undefined;
      void notifyApprovalNeeded(title);
    }

    prevApprovalNeededRef.current = approvalNeeded;
  }, [pendingAskQuestion, waitingForUserInput, permissionDenials]);

  useEffect(() => {
    const waitingSet = new Set(
      sessionStatuses
        .filter((session) => session.waitingForPermission === true)
        .filter((session) => session.id !== activeSessionId)
        .map((session) => session.id)
    );

    const newlyWaiting = [...waitingSet].filter((sessionId) => !prevBackgroundWaitingRef.current.has(sessionId));

    if (newlyWaiting.length > 0) {
      const title =
        waitingSet.size === 1
          ? `Session ${newlyWaiting[0]} is waiting for permission`
          : `${waitingSet.size} sessions are waiting for permission`;
      void notifyApprovalNeeded(title);
    }

    prevBackgroundWaitingRef.current = waitingSet;
  }, [activeSessionId, sessionStatuses]);
}

export function useSessionSideEffects({
  serverConfig,
  sseState,
  themeState,
  workspacePath,
}: SessionSideEffectManagerInput): void {
  const { provider, model } = themeState;
  const {
    connected,
    messages,
    permissionDenials,
    waitingForUserInput,
    pendingAskQuestion,
    sessionRunning,
    sessionId,
    sessionStatuses,
    setSessionStatuses,
    storeProvider,
    storeModel,
    storeSessionId,
  } = sseState;

  usePerformanceMonitor(__DEV__);

  useAgentFinishedSideEffect({
    sessionRunning,
    sessionId,
    serverConfig,
  });

  useApprovalNeededSideEffect({
    pendingAskQuestion,
    waitingForUserInput,
    permissionDenials,
    sessionStatuses,
    activeSessionId: sessionId,
  });

  useSessionManagementSync({
    connected,
    serverConfig,
    sessionId,
    sessionStatuses,
    setSessionStatuses,
    workspacePath,
    storeProvider: storeProvider ?? "codex",
    storeModel: storeModel ?? "",
    storeSessionId,
    provider,
    model,
    additionalSnapshot: {
      messages,
      liveMessages: messages.length,
    },
  });
}
