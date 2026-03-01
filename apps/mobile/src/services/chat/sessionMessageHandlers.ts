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
  sidRef: { current: string };
  getOrCreateSessionState: (sid: string) => SessionLiveState;
  getOrCreateSessionMessages: (sid: string) => Message[];
  setSessionMessages: (sid: string, messages: Message[]) => void;
  getSessionDraft: (sid: string) => string;
  setSessionDraft: (sid: string, draft: string) => void;
  displayedSessionIdRef: MutableRefObject<string | null>;
  setLiveSessionMessages: Dispatch<SetStateAction<Message[]>>;
  setSessionStateForSession: (sid: string | null, next: SessionRuntimeState) => void;
  liveMessagesRef: MutableRefObject<Message[]>;
  nextIdRef: MutableRefObject<number>;
};

export const createSessionMessageHandlers = (deps: SessionMessageHandlerDeps): SessionMessageHandlers => {
  const {
    sidRef,
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
    const sid = sidRef.current;
    const currentMessages = getOrCreateSessionMessages(sid);
    const newMsg: Message = { id, role, content, codeReferences };
    const nextMessages = [...currentMessages, newMsg];

    setSessionMessages(sid, nextMessages);
    if (displayedSessionIdRef.current === sid) {
      setLiveSessionMessages([...nextMessages]);
      liveMessagesRef.current = nextMessages;
    }
    return id;
  };

  const appendAssistantTextForSession = (chunk: string) => {
    const sanitized = stripAnsi(chunk);
    if (!sanitized) return;
    const sid = sidRef.current;
    const state = getOrCreateSessionState(sid);
    const currentMessages = getOrCreateSessionMessages(sid);
    const currentDraft = getSessionDraft(sid);
    const nextDraft = currentDraft ? currentDraft + sanitized : sanitized;
    setSessionDraft(sid, nextDraft);
    const last = currentMessages[currentMessages.length - 1];
    if (last?.role === "assistant") {
      setSessionMessages(sid, [...currentMessages.slice(0, -1), { ...last, content: nextDraft }]);
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
      setSessionMessages(sid, [...currentMessages, { id: `msg-${++nextIdRef.current}`, role: "assistant", content: nextDraft }]);
    }

    state.sessionState = "running";
    const nextMessages = getOrCreateSessionMessages(sid);
    if (displayedSessionIdRef.current === sid) {
      setLiveSessionMessages([...nextMessages]);
      setSessionStateForSession(sid, "running");
      liveMessagesRef.current = nextMessages;
    }
  };

  const finalizeAssistantMessageForSession = () => {
    const sid = sidRef.current;
    const state = getOrCreateSessionState(sid);
    const currentMessages = getOrCreateSessionMessages(sid);
    const raw = getSessionDraft(sid);
    const cleaned = stripTrailingIncompleteTag(raw ?? "");

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
          setSessionMessages(sid, currentMessages.slice(0, -1));
        }
      } else if (last.content !== cleaned) {
        if (__DEV__) {
          console.warn("[finalize] content MISMATCH — syncing to draft", {
            contentLen: ((last.content as string) ?? "").length,
            draftLen: cleaned.length,
          });
        }
        setSessionMessages(sid, [...currentMessages.slice(0, -1), { ...last, content: cleaned }]);
      }
    }

    const afterTrimMessages = getOrCreateSessionMessages(sid);
    const lastAfterTrim = afterTrimMessages[afterTrimMessages.length - 1];
    if (lastAfterTrim?.role === "assistant" && (lastAfterTrim.content ?? "").trim() === "") {
      setSessionMessages(sid, afterTrimMessages.slice(0, -1));
    }

    setSessionDraft(sid, "");
    const finalMessages = getOrCreateSessionMessages(sid);
    state.sessionState = "idle";
    if (displayedSessionIdRef.current === sid) {
      setLiveSessionMessages([...finalMessages]);
      setSessionStateForSession(sid, "idle");
      liveMessagesRef.current = finalMessages;
    }
  };

  return {
    addMessageForSession,
    appendAssistantTextForSession,
    finalizeAssistantMessageForSession,
  };
};
