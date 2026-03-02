import type { CodeRefPayload } from "@/components/file/FileViewerModal";
import type { Provider } from "@/core/modelOptions";
import type {
    CodeReference, LastRunOptions,
    Message,
    PendingAskUserQuestion,
    PermissionDenial
} from "@/core/types";
import { getAllowedToolsFromDenials } from "@/services/providers/stream";
import { useSessionManagementStore } from "@/state/sessionManagementStore";
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { normalizeSubmitPayload, stableStringify } from "./hooksSerialization";
import { appendCodeRefsToPrompt } from "./hooksUtils";
import { applySubmitError, applySubmitSuccess, type SubmitHandlerDeps } from "./submitPromptHandler";
import type { UseSessionCache } from "./useSessionCache";

type UseChatActionsParams = {
  serverUrl: string;
  provider: Provider;
  model: string;
  sessionId: string | null;
  pendingAskQuestion: PendingAskUserQuestion | null;
  permissionDenials: PermissionDenial[] | null;
  lastRunOptionsRef: MutableRefObject<LastRunOptions>;
  liveMessagesRef: MutableRefObject<Message[]>;
  pendingMessagesForNewSessionRef: MutableRefObject<Message[]>;
  outputBufferRef: MutableRefObject<string>;
  displayedSessionIdRef: MutableRefObject<string | null>;
  skipReplayForSessionRef: MutableRefObject<string | null>;
  addMessage: (role: Message["role"], content: string, codeReferences?: CodeReference[]) => string;
  sessionCache: UseSessionCache;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setLiveSessionMessages: Dispatch<SetStateAction<Message[]>>;
  setPermissionDenials: Dispatch<SetStateAction<PermissionDenial[] | null>>;
  setPendingAskQuestion: Dispatch<SetStateAction<PendingAskUserQuestion | null>>;
  setLastSessionTerminated: Dispatch<SetStateAction<boolean>>;
  setWaitingForUserInput: Dispatch<SetStateAction<boolean>>;
};

export function useChatActions(params: UseChatActionsParams) {
  const {
    serverUrl,
    provider,
    model,
    sessionId,
    pendingAskQuestion,
    permissionDenials,
    lastRunOptionsRef,
    liveMessagesRef,
    pendingMessagesForNewSessionRef,
    outputBufferRef,
    displayedSessionIdRef,
    skipReplayForSessionRef,
    addMessage,
    sessionCache,
    setSessionId,
    setLiveSessionMessages,
    setPermissionDenials,
    setPendingAskQuestion,
    setLastSessionTerminated,
    setWaitingForUserInput,
  } = params;

  const {
    deduplicateMessageIds,
    getOrCreateSessionState,
    getOrCreateSessionMessages,
    setSessionMessages,
    setSessionDraft,
    setSessionStateForSession,
    setConnectionIntent,
    clearConnectionIntent,
    closeActiveSse,
    touchSession,
    evictOldestSessions,
  } = sessionCache;

  const syncRunningStatusToGlobalStore = useCallback(
    (targetSessionId: string, promptText: string) => {
      const sessionStore = useSessionManagementStore.getState();
      const existing = sessionStore.sessionStatuses.find((session) => session.id === targetSessionId);
      const hasExistingTitle = typeof existing?.title === "string" && existing.title.trim().length > 0;
      const shouldUsePromptAsTitle = !hasExistingTitle || existing?.title === "(no input)";
      const promptTitle = promptText.trim().slice(0, 80);

      sessionStore.upsertSessionStatus({
        id: targetSessionId,
        cwd: existing?.cwd ?? null,
        model,
        lastAccess: Date.now(),
        status: "running",
        title: shouldUsePromptAsTitle ? promptTitle || "(no input)" : (existing?.title ?? "(no input)"),
      });
    },
    [model]
  );

  const submitPrompt = useCallback(
    async (
      prompt: string,
      permissionMode?: string,
      allowedTools?: string[],
      codeRefs?: CodeRefPayload[],
    ) => {
      const safePrompt = typeof prompt === "string" ? prompt : String(prompt ?? "");
      const fullPrompt = appendCodeRefsToPrompt(
        safePrompt,
        codeRefs ? codeRefs.map((ref) => ({ path: ref.path, snippet: ref.snippet })) : undefined
      );

      addMessage("user", safePrompt);
      setPermissionDenials(null);
      setLastSessionTerminated(false);
      setSessionStateForSession(sessionId, "running");
      setWaitingForUserInput(false);

      await new Promise<void>((resolve) => queueMicrotask(resolve));

      const payload = normalizeSubmitPayload({
        prompt: fullPrompt,
        permissionMode,
        allowedTools,
        provider,
        model,
        sessionId,
      });

      const resetRunningState = () => {
        setSessionStateForSession(sessionId, "idle");
        setWaitingForUserInput(false);
      };

      const submitHandlerDeps: SubmitHandlerDeps = {
        sessionId,
        displayedSessionIdRef,
        liveMessagesRef,
        pendingMessagesForNewSessionRef,
        outputBufferRef,
        skipReplayForSessionRef,
        getOrCreateSessionState,
        getOrCreateSessionMessages,
        setSessionMessages,
        setSessionDraft,
        setSessionStateForSession,
        setConnectionIntent,
        deduplicateMessageIds,
        touchSession,
        evictOldestSessions,
        setLiveSessionMessages,
        setSessionId,
        syncRunningStatusToGlobalStore,
      };

      let submitStage = "prepare";
      try {
        const requestBody = stableStringify(payload);
        if (__DEV__) {
          const payloadKeys = Object.entries(payload)
            .filter(([, value]) => value !== undefined)
            .map(([key]) => key);
          console.log("[sse] submit prompt payload keys", payloadKeys);
          console.log("[sse] submit prompt body length", requestBody.length);
        }
        submitStage = "fetch";
        const response = await fetch(`${serverUrl}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        submitStage = "parse-json";
        const data = await response.json();
        submitStage = "apply-result";
        if (data.ok && data.sessionId) {
          applySubmitSuccess(data, safePrompt, submitHandlerDeps);
        } else {
          applySubmitError(data, submitHandlerDeps, resetRunningState);
        }
      } catch (error) {
        const errStage = submitStage;
        const errStatus = error && typeof error === "object" && "status" in error ? (error as { status?: number }).status : undefined;
        if (__DEV__) {
          console.error("Failed to submit prompt", {
            stage: errStage ?? "request",
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            status: errStatus,
          });
        } else {
          console.error("Failed to submit prompt", error);
        }
        setConnectionIntent(sessionId, false);
        resetRunningState();
      }
    },
    [
      addMessage,
      deduplicateMessageIds,
      getOrCreateSessionState,
      getOrCreateSessionMessages,
      setSessionMessages,
      setSessionDraft,
      setConnectionIntent,
      provider,
      model,
      serverUrl,
      sessionId,
      touchSession,
      evictOldestSessions,
      setSessionStateForSession,
      setPermissionDenials,
      setLastSessionTerminated,
      setWaitingForUserInput,
      displayedSessionIdRef,
      liveMessagesRef,
      pendingMessagesForNewSessionRef,
      outputBufferRef,
      setLiveSessionMessages,
      setSessionId,
      syncRunningStatusToGlobalStore,
    ]
  );


  const submitAskQuestionAnswer = useCallback(
    async (answers: Array<{ header: string; selected: string[] }>) => {
      if (!sessionId || !pendingAskQuestion) return;

      try {
        await fetch(`${serverUrl}/api/sessions/${sessionId}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: { content: [{ type: "tool_result", content: JSON.stringify(answers) }] } }),
        });
      } catch (error) {
        console.error("Failed to submit question answer", error);
      }

      setPendingAskQuestion(null);
      setWaitingForUserInput(false);
    },
    [sessionId, pendingAskQuestion, serverUrl, setPendingAskQuestion, setWaitingForUserInput]
  );

  const submitPermissionDecision = useCallback(
    async (approved: boolean) => {
      if (!sessionId || !pendingAskQuestion) return;

      try {
        await fetch(`${serverUrl}/api/sessions/${sessionId}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: Boolean(approved) }),
        });
      } catch (error) {
        console.error("Failed to submit permission decision", error);
      }

      setPendingAskQuestion(null);
      setWaitingForUserInput(false);
      setPermissionDenials(null);
    },
    [serverUrl, sessionId, pendingAskQuestion, setPermissionDenials, setPendingAskQuestion, setWaitingForUserInput]
  );

  const dismissAskQuestion = useCallback(() => {
    setPendingAskQuestion(null);
    setWaitingForUserInput(false);
  }, [setPendingAskQuestion, setWaitingForUserInput]);

  const retryAfterPermission = useCallback(
    async (permissionMode?: string, retryPrompt?: string) => {
      const denials = permissionDenials ?? [];
      const allowedTools = getAllowedToolsFromDenials(denials);
      const prompt =
        typeof retryPrompt === "string" && retryPrompt.trim()
          ? retryPrompt.trim()
          : "(retry with new permissions)";

      setSessionStateForSession(sessionId, "running");
      setWaitingForUserInput(false);
      try {
        const requestBody = stableStringify(
          normalizeSubmitPayload({
            prompt,
            permissionMode: permissionMode ?? lastRunOptionsRef.current.permissionMode ?? undefined,
            allowedTools,
            replaceRunning: true,
            provider,
            model,
            sessionId,
          })
        );
        const response = await fetch(`${serverUrl}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        const data = await response.json();
        if (data.ok && data.sessionId) {
          const nextSessionId = data.sessionId;
          const nextState = getOrCreateSessionState(nextSessionId);
          nextState.sessionState = "running";
          setSessionId(nextSessionId);
          setSessionStateForSession(nextSessionId, "running");
          setConnectionIntent(nextSessionId, true);
        } else {
          setSessionStateForSession(sessionId, "idle");
          setWaitingForUserInput(false);
          setConnectionIntent(sessionId, false);
        }
      } catch (error) {
        console.error("Failed to retry after permission", error);
        setSessionStateForSession(sessionId, "idle");
        setWaitingForUserInput(false);
        setConnectionIntent(sessionId, false);
      }

      setPermissionDenials(null);
    },
    [
      permissionDenials,
      provider,
      model,
      serverUrl,
      sessionId,
      getOrCreateSessionState,
      setSessionStateForSession,
      setConnectionIntent,
      lastRunOptionsRef,
      setSessionId,
      setWaitingForUserInput,
      setPermissionDenials,
    ]
  );

  const dismissPermission = useCallback(() => {
    setPermissionDenials(null);
  }, [setPermissionDenials]);

  const terminateAgent = useCallback(async () => {
    setLastSessionTerminated(true);
    if (!sessionId) return;
    try {
      await fetch(`${serverUrl}/api/sessions/${sessionId}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setConnectionIntent(sessionId, false);
    } catch (error) {
      console.error("Failed to terminate agent", error);
    }
  }, [sessionId, serverUrl, setConnectionIntent, setLastSessionTerminated]);

  const resetSession = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(`${serverUrl}/api/sessions/${sessionId}/terminate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resetSession: true }),
        });
      } catch (error) {
        console.error("Failed to reset session", error);
      }
      if (__DEV__) console.log("[sse] disconnected (reset)", { sessionId });
      closeActiveSse("reset");
      clearConnectionIntent(sessionId);
    }
    setLiveSessionMessages([]);
    setSessionId(null);
    setPermissionDenials(null);
    lastRunOptionsRef.current = { permissionMode: null, allowedTools: [], useContinue: false };
    setPendingAskQuestion(null);
    setLastSessionTerminated(false);
    if (sessionId) setSessionDraft(sessionId, "");
  }, [
    closeActiveSse,
    sessionId,
    serverUrl,
    setConnectionIntent,
    clearConnectionIntent,
    setLiveSessionMessages,
    setSessionId,
    setPermissionDenials,
    lastRunOptionsRef,
    setPendingAskQuestion,
    setLastSessionTerminated,
    setSessionDraft,
  ]);

  const startNewSession = useCallback(async () => {
    if (sessionId) {
      // Only disconnect the client-side SSE stream — do NOT terminate the
      // server-side Pi process.  This allows the previous session to keep
      // running in the background so the user can switch back to it later.
      if (__DEV__) console.log("[sse] disconnected (new session, keeping server process)", { sessionId });
      closeActiveSse("new-session");
      clearConnectionIntent(sessionId);
    }
    setSessionId(null);
    pendingMessagesForNewSessionRef.current = [];
    setLiveSessionMessages([]);
    setPermissionDenials(null);
    lastRunOptionsRef.current = { permissionMode: null, allowedTools: [], useContinue: false };
    setPendingAskQuestion(null);
    setLastSessionTerminated(false);
    setWaitingForUserInput(false);
    // Reset session running state so the input is editable in the new session.
    // Without this, the previous session's "running" state leaks into the new
    // session and the text input stays disabled.
    setSessionStateForSession(null, "idle");
    if (sessionId) setSessionDraft(sessionId, "");
  }, [
    closeActiveSse,
    sessionId,
    clearConnectionIntent,
    pendingMessagesForNewSessionRef,
    setLiveSessionMessages,
    setPermissionDenials,
    lastRunOptionsRef,
    setPendingAskQuestion,
    setLastSessionTerminated,
    setSessionDraft,
    setSessionId,
    setWaitingForUserInput,
    setSessionStateForSession,
  ]);

  return {
    submitPrompt,
    submitAskQuestionAnswer,
    submitPermissionDecision,
    dismissAskQuestion,
    retryAfterPermission,
    dismissPermission,
    terminateAgent,
    resetSession,
    startNewSession,
  };
}
