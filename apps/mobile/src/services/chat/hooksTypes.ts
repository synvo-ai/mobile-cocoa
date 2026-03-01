import type { Provider } from "@/core/modelOptions";
import type { CodeReference, IServerConfig, LastRunOptions, Message, PendingAskUserQuestion, PermissionDenial } from "@/core/types";


export interface UseChatOptions {
  serverConfig?: IServerConfig;
  provider?: Provider;
  model?: string;
  onConnectedChange?: (connected: boolean) => void;
  onSessionRunningChange?: (sessionRunning: boolean) => void;
  onWaitingForUserInputChange?: (waitingForUserInput: boolean) => void;
  onPermissionDenialsChange?: (permissionDenials: PermissionDenial[] | null) => void;
  onPendingAskQuestionChange?: (pendingAskQuestion: PendingAskUserQuestion | null) => void;
  onLastSessionTerminatedChange?: (lastSessionTerminated: boolean) => void;
  onMessagesChange?: (messages: Message[]) => void;
}

export type EventSourceLike = {
  addEventListener: (event: string, handler: (...args: any[]) => void) => void;
  removeEventListener: (event: string, handler: (...args: any[]) => void) => void;
  close: () => void;
};

export type EventSourceCtor = new (url: string) => EventSourceLike;

export type SessionRuntimeState = "idle" | "running";

export type SessionLiveState = {
  sessionState: SessionRuntimeState;
};

export type { Message, CodeReference, PermissionDenial, PendingAskUserQuestion, LastRunOptions };
