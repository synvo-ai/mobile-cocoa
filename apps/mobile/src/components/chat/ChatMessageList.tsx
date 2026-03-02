import { hasCodeBlockContent, hasFileActivityContent, MessageBubble } from "@/components/chat/MessageBubble";
import { PermissionDenialBanner } from "@/components/common/PermissionDenialBanner";
import type { Provider as BrandProvider } from "@/core/modelOptions";
import { EntranceAnimation } from "@/designSystem";
import type { Message, PermissionDenial } from "@/services/chat/hooks";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
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
  workspaceName?: string;
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
    <MessageBubble
      message={item}
      isTerminatedLabel={showTerminated}
      showAsTailBox={showTailBox}
      tailBoxMaxHeight={tailBoxMaxHeight}
      provider={provider}
      onOpenUrl={onOpenUrl}
      onFileSelect={onFileSelect}
    />
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
  workspaceName,
}: ChatMessageListProps) {
  const renderedMessages = useMemo(
    () =>
      messages.map((item, index) => {
        const isLast = index === messages.length - 1;
        // Only stagger for the first few messages or recent ones
        const staggerDelay = messages.length > 10 ? (index > messages.length - 5 ? (index - (messages.length - 5)) * 100 : 0) : index * 100;

        return (
          <EntranceAnimation
            key={item.id}
            variant="slideUp"
            delay={staggerDelay}
            duration={400}
          >
            <ChatMessageRow
              item={item}
              isLast={isLast}
              lastSessionTerminated={lastSessionTerminated}
              tailBoxMaxHeight={tailBoxMaxHeight}
              provider={provider}
              onOpenUrl={onOpenUrl}
              onFileSelect={onFileSelect}
            />
          </EntranceAnimation>
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
      bounces={false}
      onContentSizeChange={onContentSizeChange}
    >
      {messages.length === 0 ? (
        <Box className="flex-1 items-center justify-center p-8 mb-20">
          <Text size="2xl" bold className="text-typography-900 mb-2 text-center">
            Welcome to Mobile Cocoa
          </Text>
          <Text size="md" className="text-typography-500 mb-8 text-center px-4">
            Vibe coding everywhere,{"\n"}
            logic weaving through the air.
          </Text>
          {workspaceName && (
            <Text size="xs" className="text-typography-400 text-center opacity-70">
              {workspaceName}
            </Text>
          )}
        </Box>
      ) : (
        renderedMessages
      )}
      <EntranceAnimation variant="fade" duration={200}>
        {chatListFooter}
      </EntranceAnimation>
    </ScrollView>
  );
});
