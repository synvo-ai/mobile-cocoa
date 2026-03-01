import type { Message, PendingAskUserQuestion, PermissionDenial } from "@/core/types";
import { useEffect, useRef } from "react";
import type { SessionRuntimeState, UseChatOptions } from "./hooksTypes";

type RuntimeCallbacks = Pick<
  UseChatOptions,
  | "onConnectedChange"
  | "onSessionRunningChange"
  | "onWaitingForUserInputChange"
  | "onPermissionDenialsChange"
  | "onPendingAskQuestionChange"
  | "onLastSessionTerminatedChange"
  | "onMessagesChange"
>;

type UseChatExternalCallbacksParams = RuntimeCallbacks & {
  connected: boolean;
  sessionState: SessionRuntimeState;
  waitingForUserInput: boolean;
  permissionDenials: PermissionDenial[] | null;
  pendingAskQuestion: PendingAskUserQuestion | null;
  lastSessionTerminated: boolean;
  liveSessionMessages: Message[];
};

export function useChatExternalCallbacks(params: UseChatExternalCallbacksParams) {
  const {
    connected,
    sessionState,
    waitingForUserInput,
    permissionDenials,
    pendingAskQuestion,
    lastSessionTerminated,
    liveSessionMessages,
    onConnectedChange,
    onSessionRunningChange,
    onWaitingForUserInputChange,
    onPermissionDenialsChange,
    onPendingAskQuestionChange,
    onLastSessionTerminatedChange,
    onMessagesChange,
  } = params;

  const runtimeStateCallbacksRef = useRef({
    onConnectedChange,
    onSessionRunningChange,
    onWaitingForUserInputChange,
    onPermissionDenialsChange,
    onPendingAskQuestionChange,
    onLastSessionTerminatedChange,
    onMessagesChange,
  });

  useEffect(() => {
    runtimeStateCallbacksRef.current = {
      onConnectedChange,
      onSessionRunningChange,
      onWaitingForUserInputChange,
      onPermissionDenialsChange,
      onPendingAskQuestionChange,
      onLastSessionTerminatedChange,
      onMessagesChange,
    };
  }, [
    onConnectedChange,
    onSessionRunningChange,
    onWaitingForUserInputChange,
    onPermissionDenialsChange,
    onPendingAskQuestionChange,
    onLastSessionTerminatedChange,
    onMessagesChange,
  ]);

  useEffect(() => {
    runtimeStateCallbacksRef.current.onConnectedChange?.(connected);
  }, [connected]);

  useEffect(() => {
    runtimeStateCallbacksRef.current.onSessionRunningChange?.(sessionState !== "idle");
  }, [sessionState]);

  useEffect(() => {
    runtimeStateCallbacksRef.current.onWaitingForUserInputChange?.(waitingForUserInput);
  }, [waitingForUserInput]);

  useEffect(() => {
    runtimeStateCallbacksRef.current.onPermissionDenialsChange?.(permissionDenials);
  }, [permissionDenials]);

  useEffect(() => {
    runtimeStateCallbacksRef.current.onPendingAskQuestionChange?.(pendingAskQuestion);
  }, [pendingAskQuestion]);

  useEffect(() => {
    runtimeStateCallbacksRef.current.onLastSessionTerminatedChange?.(lastSessionTerminated);
  }, [lastSessionTerminated]);

  useEffect(() => {
    runtimeStateCallbacksRef.current.onMessagesChange?.(liveSessionMessages);
  }, [liveSessionMessages]);
}
