import { hasCodeBlockContent, hasFileActivityContent, MessageBubble } from "@/components/chat/MessageBubble";
import { PermissionDenialBanner } from "@/components/common/PermissionDenialBanner";
import type { Provider as BrandProvider } from "@/core/modelOptions";
import { EntranceAnimation } from "@/design-system";
import type { Message, PermissionDenial } from "@/services/chat/hooks";
import React, { memo, useMemo } from "react";
import { ScrollView, type StyleProp, type ViewStyle } from "react-native";

type ChatMessageListProps = {
  messages: Message[];
  provider: BrandProvider;
  sessionId: string | null;
  permissionDenials: PermissionDenial[];
  lastSessionTerminated: boolean;
  onOpenUrl: (url: string) => void;
  onFileSelect: (path: string) => void;
  onRetryPermission: () => void;
  onDismissPermission: () => void;
  tailBoxMaxHeight: number;
  scrollViewRef: React.RefObject<ScrollView | null>;
  onContentSizeChange: () => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

type ChatMessageRowProps = {
  item: Message;
  isLast: boolean;
  lastSessionTerminated: boolean;
  tailBoxMaxHeight: number;
  provider: BrandProvider;
  onOpenUrl: (url: string) => void;
  onFileSelect: (path: string) => void;
};

const chatMessageRowRenderCounts = new Map<string, number>();

const ChatMessageRow = memo(function ChatMessageRow({
  item,
  isLast,
  lastSessionTerminated,
  tailBoxMaxHeight,
  provider,
  onOpenUrl,
  onFileSelect,
}: ChatMessageRowProps) {
  if (__DEV__) {
    const previous = chatMessageRowRenderCounts.get(item.id) ?? 0;
    const next = previous + 1;
    chatMessageRowRenderCounts.set(item.id, next);
    if (next === 1 || next % 25 === 0) {
      console.debug("[ChatMessageRow] render", item.id, { count: next });
    }
  }

  const showTerminated =
    lastSessionTerminated && isLast && item.role === "assistant" && !item.content;
  const hasCodeOrFileContent =
    hasFileActivityContent(item.content) || hasCodeBlockContent(item.content);
  const showTailBox =
    isLast &&
    item.role === "assistant" &&
    !!(item.content && item.content.trim()) &&
    hasCodeOrFileContent;

  return (
    <EntranceAnimation variant="slideUp" duration={400}>
      <MessageBubble
        message={item}
        isTerminatedLabel={showTerminated}
        showAsTailBox={showTailBox}
        tailBoxMaxHeight={tailBoxMaxHeight}
        provider={provider}
        onOpenUrl={onOpenUrl}
        onFileSelect={onFileSelect}
      />
    </EntranceAnimation>
  );
}, (prev, next) => {
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.role !== next.item.role) return false;
  if (prev.item.content !== next.item.content) return false;
  if ((prev.item.codeReferences?.length ?? 0) !== (next.item.codeReferences?.length ?? 0)) return false;
  if (prev.isLast !== next.isLast) return false;
  if (prev.lastSessionTerminated !== next.lastSessionTerminated) return false;
  if (prev.tailBoxMaxHeight !== next.tailBoxMaxHeight) return false;
  if (prev.provider !== next.provider) return false;
  if (prev.onOpenUrl !== next.onOpenUrl) return false;
  if (prev.onFileSelect !== next.onFileSelect) return false;
  return true;
});

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  provider,
  sessionId,
  permissionDenials,
  lastSessionTerminated,
  onOpenUrl,
  onFileSelect,
  onRetryPermission,
  onDismissPermission,
  tailBoxMaxHeight,
  scrollViewRef,
  onContentSizeChange,
  style,
  contentContainerStyle,
}: ChatMessageListProps) {
  const renderedMessages = useMemo(
    () =>
      messages.map((item, index) => {
        const isLast = index === messages.length - 1;
        return (
          <ChatMessageRow
            key={item.id}
            item={item}
            isLast={isLast}
            lastSessionTerminated={lastSessionTerminated}
            tailBoxMaxHeight={tailBoxMaxHeight}
            provider={provider}
            onOpenUrl={onOpenUrl}
            onFileSelect={onFileSelect}
          />
        );
      }),
    [messages, lastSessionTerminated, tailBoxMaxHeight, provider, onOpenUrl, onFileSelect]
  );

  const chatListFooter = useMemo(
    () => (
      <>
        {permissionDenials && permissionDenials.length > 0 && (
          <PermissionDenialBanner
            denials={permissionDenials}
            onDismiss={onDismissPermission}
            onAccept={onRetryPermission}
          />
        )}
      </>
    ),
    [permissionDenials, onDismissPermission, onRetryPermission]
  );

  return (
    <ScrollView
      key={`chat-${sessionId ?? "none"}`}
      ref={scrollViewRef}
      style={style}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={onContentSizeChange}
    >
      {renderedMessages}
      <EntranceAnimation variant="fade" duration={200}>
        {chatListFooter}
      </EntranceAnimation>
    </ScrollView>
  );
});
