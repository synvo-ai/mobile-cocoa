import type { CodeReference, Message } from "@/core/types";
import { stripAnsi, stripTrailingIncompleteTag } from "@/services/providers/stream";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { SessionLiveState, SessionRuntimeState } from "./hooksTypes";

export interface SessionMessageHandlers {
  addMessageForSession: (role: Message["role"], content: string, codeReferences?: CodeReference[]) => string;
  appendAssistantTextForSession: (chunk: string) => void;
  finalizeAssistantMessageForSession: () => void;
}

type SessionMessageHandlerDeps = {
  sessionIdRef: { current: string };
  getOrCreateSessionState: (sessionId: string) => SessionLiveState;
  getOrCreateSessionMessages: (sessionId: string) => Message[];
  setSessionMessages: (sessionId: string, messages: Message[]) => void;
  getSessionDraft: (sessionId: string) => string;
  setSessionDraft: (sessionId: string, draft: string) => void;
  displayedSessionIdRef: MutableRefObject<string | null>;
  setLiveSessionMessages: Dispatch<SetStateAction<Message[]>>;
  setSessionStateForSession: (sessionId: string | null, next: SessionRuntimeState) => void;
  liveMessagesRef: MutableRefObject<Message[]>;
  nextIdRef: MutableRefObject<number>;
};

export const createSessionMessageHandlers = (deps: SessionMessageHandlerDeps): SessionMessageHandlers => {
  const {
    sessionIdRef,
    getOrCreateSessionState,
    getOrCreateSessionMessages,
    setSessionMessages,
    getSessionDraft,
    setSessionDraft,
    displayedSessionIdRef,
    setLiveSessionMessages,
    setSessionStateForSession,
    liveMessagesRef,
    nextIdRef,
  } = deps;

  const addMessageForSession = (role: Message["role"], content: string, codeReferences?: CodeReference[]) => {
    const id = `msg-${++nextIdRef.current}`;
    const sessionId = sessionIdRef.current;
    const currentMessages = getOrCreateSessionMessages(sessionId);
    const newMsg: Message = { id, role, content, codeReferences };
    const nextMessages = [...currentMessages, newMsg];

    setSessionMessages(sessionId, nextMessages);
    if (displayedSessionIdRef.current === sessionId) {
      setLiveSessionMessages([...nextMessages]);
      liveMessagesRef.current = nextMessages;
    }
    return id;
  };

  const appendAssistantTextForSession = (chunk: string) => {
    const sanitized = stripAnsi(chunk);
    if (!sanitized) return;
    const sessionId = sessionIdRef.current;
    const state = getOrCreateSessionState(sessionId);
    const currentMessages = getOrCreateSessionMessages(sessionId);
    const currentDraft = getSessionDraft(sessionId);
    const nextDraft = currentDraft ? currentDraft + sanitized : sanitized;
    setSessionDraft(sessionId, nextDraft);
    const last = currentMessages[currentMessages.length - 1];
    if (last?.role === "assistant") {
      setSessionMessages(sessionId, [...currentMessages.slice(0, -1), { ...last, content: nextDraft }]);
    } else {
      if (__DEV__ && currentDraft) {
        console.warn("[appendAssistantText] NEW assistant msg with existing draft!", {
          draftLen: currentDraft.length,
          nextDraftLen: nextDraft.length,
          sanitizedLen: sanitized.length,
          lastRole: last?.role ?? "(none)",
          msgCount: currentMessages.length,
        });
      }
      // Use nextDraft (full accumulated text) — not just sanitized (current chunk) —
      // so all previously streamed content is preserved when a non-assistant message
      // (e.g. system/tool) was inserted mid-stream.
      setSessionMessages(sessionId, [...currentMessages, { id: `msg-${++nextIdRef.current}`, role: "assistant", content: nextDraft }]);
    }

    state.sessionState = "running";
    const nextMessages = getOrCreateSessionMessages(sessionId);
    if (displayedSessionIdRef.current === sessionId) {
      setLiveSessionMessages([...nextMessages]);
      setSessionStateForSession(sessionId, "running");
      liveMessagesRef.current = nextMessages;
    }
  };

  const finalizeAssistantMessageForSession = () => {
    const sessionId = sessionIdRef.current;
    const state = getOrCreateSessionState(sessionId);
    const currentMessages = getOrCreateSessionMessages(sessionId);
    const draftText = getSessionDraft(sessionId);
    const cleaned = stripTrailingIncompleteTag(draftText ?? "");

    // Always sync the last assistant message with the full cleaned draft.
    // This ensures content is correct even if a mid-stream non-assistant message
    // caused the assistant message to be recreated with only a partial chunk.
    const last = currentMessages[currentMessages.length - 1];
    if (last?.role === "assistant") {
      const trimmed = cleaned.trim();
      const existingContentTrimmed = ((last.content as string) ?? "").trim();
      
      if (trimmed === "") {
        // Only delete the assistant message if it literally has no content accumulated.
        // It's possible the draft was already cleared by a prior finalize call,
        // in which case we don't want to delete the completed message.
        if (existingContentTrimmed === "") {
          setSessionMessages(sessionId, currentMessages.slice(0, -1));
        }
      } else if (last.content !== cleaned) {
        if (__DEV__) {
          console.warn("[finalize] content MISMATCH — syncing to draft", {
            contentLen: ((last.content as string) ?? "").length,
            draftLen: cleaned.length,
          });
        }
        setSessionMessages(sessionId, [...currentMessages.slice(0, -1), { ...last, content: cleaned }]);
      }
    }

    const afterTrimMessages = getOrCreateSessionMessages(sessionId);
    const lastAfterTrim = afterTrimMessages[afterTrimMessages.length - 1];
    if (lastAfterTrim?.role === "assistant" && (lastAfterTrim.content ?? "").trim() === "") {
      setSessionMessages(sessionId, afterTrimMessages.slice(0, -1));
    }

    setSessionDraft(sessionId, "");
    const finalMessages = getOrCreateSessionMessages(sessionId);
    state.sessionState = "idle";
    if (displayedSessionIdRef.current === sessionId) {
      setLiveSessionMessages([...finalMessages]);
      setSessionStateForSession(sessionId, "idle");
      liveMessagesRef.current = finalMessages;
    }
  };

  return {
    addMessageForSession,
    appendAssistantTextForSession,
    finalizeAssistantMessageForSession,
  };
};
