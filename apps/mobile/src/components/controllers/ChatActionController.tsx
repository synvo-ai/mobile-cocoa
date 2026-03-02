import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import type { CodeRefPayload } from "@/components/file/FileViewerModal";
import type { Provider as BrandProvider } from "@/core/modelOptions";
import { triggerHaptic } from "@/designSystem";
import { getSubmitPermissionConfig } from "@/features/app/appConfig";
import { useChat, type Message } from "@/services/chat/hooks";

type SseApi = ReturnType<typeof useChat>;

export type ChatActionControllerProps = {
  provider: BrandProvider;
  sessionId?: string | null;
  messages: Message[];
  submitPrompt: SseApi["submitPrompt"];
  submitAskQuestionAnswer: SseApi["submitAskQuestionAnswer"];
  submitPermissionDecision: SseApi["submitPermissionDecision"];
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
  onPermissionDecision: (approved: boolean) => void;
  onAskQuestionCancel: () => void;
  onRetryPermission: () => void;
  onCommitByAI: (userRequest: string) => void;
  onAutoApproveToolConfirmChange: (next: boolean) => void;
  onOpenWebPreview: () => void;
  onOpenPreviewInApp: (url: string) => void;
  previewUrl: string | null;
  onClosePreview: () => void;
};

export const ChatActionController = memo(function ChatActionController({
  provider,
  sessionId: _sessionId,
  messages,
  submitPrompt,
  submitAskQuestionAnswer,
  submitPermissionDecision,
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
      const backend = getSubmitPermissionConfig();
      submitPrompt(
        prompt,
        undefined,
        undefined,
        pendingCodeRefs.length ? pendingCodeRefs : undefined,
        backend.approvalMode
      );

      if (pendingCodeRefs.length) {
        setPendingCodeRefs([]);
      }

      onSubmitSideEffects();
    },
    [
      onSubmitSideEffects,
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

  const onPermissionDecision = useCallback(
    (approved: boolean) => {
      submitPermissionDecision(approved);
    },
    [submitPermissionDecision]
  );

  const onRetryPermission = useCallback(() => {
    const backend = getSubmitPermissionConfig();
    const lastUserMessage = [...messagesRef.current].reverse().find((message) => message.role === "user");
    retryAfterPermission(undefined, backend.approvalMode, lastUserMessage?.content);
  }, [retryAfterPermission]);

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
      onPermissionDecision,
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
