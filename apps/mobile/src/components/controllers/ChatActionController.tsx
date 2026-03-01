import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import type { CodeRefPayload } from "@/components/file/FileViewerModal";
import type { Provider as BrandProvider } from "@/core/modelOptions";
import { triggerHaptic } from "@/designSystem";
import { getSubmitPermissionConfig } from "@/features/app/appConfig";
import { useChat, type Message } from "@/services/chat/hooks";
import type { PermissionModeUI } from "@/utils/permission";

type SseApi = ReturnType<typeof useChat>;

export type ChatActionControllerProps = {
  provider: BrandProvider;
  permissionModeUI: PermissionModeUI;
  sessionId?: string | null;
  messages: Message[];
  submitPrompt: SseApi["submitPrompt"];
  submitAskQuestionAnswer: SseApi["submitAskQuestionAnswer"];
  dismissAskQuestion: SseApi["dismissAskQuestion"];
  retryAfterPermission: SseApi["retryAfterPermission"];
  closeFileViewer: () => void;
  resetSession: () => void;
  onSubmitSideEffects: () => void;
  children: (state: ChatActionControllerState) => React.ReactNode;
};

export type ChatActionControllerState = {
  pendingCodeRefs: CodeRefPayload[];
  onSubmitPrompt: (prompt: string) => void;
  onAddCodeReference: (payload: CodeRefPayload) => void;
  onRemoveCodeRef: (index: number) => void;
  onAskQuestionSubmit: (answers: Array<{ header: string; selected: string[] }>) => void;
  onAskQuestionCancel: () => void;
  onRetryPermission: () => void;
  onCommitByAI: (userRequest: string) => void;
  onOpenWebPreview: () => void;
  onOpenPreviewInApp: (url: string) => void;
  previewUrl: string | null;
  onClosePreview: () => void;
};

export const ChatActionController = memo(function ChatActionController({
  provider,
  permissionModeUI,
  sessionId: _sessionId,
  messages,
  submitPrompt,
  submitAskQuestionAnswer,
  dismissAskQuestion,
  retryAfterPermission,
  closeFileViewer,
  resetSession,
  onSubmitSideEffects,
  children,
}: ChatActionControllerProps) {
  const [pendingCodeRefs, setPendingCodeRefs] = useState<CodeRefPayload[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const onSubmitPrompt = useCallback(
    (prompt: string) => {
      const { backend, codexOptions } = getSubmitPermissionConfig(permissionModeUI, provider);
      submitPrompt(
        prompt,
        backend.permissionMode,
        undefined,
        pendingCodeRefs.length ? pendingCodeRefs : undefined,
        backend.approvalMode,
        codexOptions
      );

      if (pendingCodeRefs.length) {
        setPendingCodeRefs([]);
      }

      onSubmitSideEffects();
    },
    [
      onSubmitSideEffects,
      permissionModeUI,
      provider,
      submitPrompt,
      pendingCodeRefs,
    ]
  );

  const onAddCodeReference = useCallback((payload: CodeRefPayload) => {
    triggerHaptic("light");
    setPendingCodeRefs((prev) => [...prev, payload]);
  }, []);

  const onRemoveCodeRef = useCallback((index: number) => {
    triggerHaptic("selection");
    setPendingCodeRefs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onAskQuestionSubmit = useCallback(
    (answers: Array<{ header: string; selected: string[] }>) => {
      submitAskQuestionAnswer(answers);
    },
    [submitAskQuestionAnswer]
  );

  const onAskQuestionCancel = useCallback(() => {
    dismissAskQuestion();
  }, [dismissAskQuestion]);

  const onRetryPermission = useCallback(() => {
    const { backend } = getSubmitPermissionConfig(permissionModeUI, provider);
    const lastUserMessage = [...messagesRef.current].reverse().find((message) => message.role === "user");
    retryAfterPermission(backend.permissionMode, backend.approvalMode, lastUserMessage?.content);
  }, [permissionModeUI, provider, retryAfterPermission]);

  const onCommitByAI = useCallback(
    (userRequest: string) => {
      resetSession();
      onSubmitPrompt(userRequest);
      closeFileViewer();
    },
    [closeFileViewer, onSubmitPrompt, resetSession]
  );

  const onOpenPreviewInApp = useCallback((url: string) => {
    if (url) {
      setPreviewUrl(url);
    } else {
      setPreviewUrl("");
    }
  }, []);

  const onOpenWebPreview = useCallback(() => {
    setPreviewUrl("");
  }, []);

  const onClosePreview = useCallback(() => {
    setPreviewUrl(null);
  }, []);

  const state: ChatActionControllerState = useMemo(
    () => ({
      pendingCodeRefs,
      onSubmitPrompt,
      onAddCodeReference,
      onRemoveCodeRef,
      onAskQuestionSubmit,
      onAskQuestionCancel,
      onRetryPermission,
      onCommitByAI,
      onOpenWebPreview,
      onOpenPreviewInApp,
      previewUrl,
      onClosePreview,
    }),
    [
      pendingCodeRefs,
      onSubmitPrompt,
      onAddCodeReference,
      onRemoveCodeRef,
      onAskQuestionSubmit,
      onAskQuestionCancel,
      onRetryPermission,
      onCommitByAI,
      onOpenWebPreview,
      onOpenPreviewInApp,
      previewUrl,
      onClosePreview,
    ]
  );

  return <>{children(state)}</>;
});
