import { ChevronDownIcon, VibeIcon, TerminalIcon } from "@/components/icons/ChatActionIcons";
import { BookOpenIcon, FilePenIcon, PencilIcon } from "@/components/icons/FileActivityIcons";
import { CodexIcon } from "@/components/icons/ProviderIcons";
import { MarkdownContent } from "@/components/reusable/MarkdownContent";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { EntranceAnimation, radii, spacing, triggerHaptic } from "@/designSystem";
import type { Message } from "@/services/chat/hooks";
import { stripTrailingIncompleteTag } from "@/services/providers/stream";
import { useTheme } from "@/theme/index";
import { PremiumMessageBubble } from "@/components/chat/PremiumMessageBubble";
import { MessageActionToolbar } from "@/components/chat/MessageActionToolbar";
import { ThinkingSection } from "@/components/chat/ThinkingSection";
import {
  collapseIdenticalCommandSteps, extractBashCommandOnly, fillEmptyBashBlocks,
  stripTrailingTerminalHeaderLines
} from "@/utils/bashContent";
import { parseTextWithUrlSegments, wrapBareUrlsInMarkdown } from "@/utils/markdown";
import { getFileName } from "@/utils/path";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Linking, Platform, StyleSheet, View as RNView } from "react-native";
import Animated, { useAnimatedStyle, withSpring, LinearTransition, FadeInDown, Easing } from "react-native-reanimated";
import type { MarkdownProps } from "react-native-markdown-display";
import Svg, { Polygon } from "react-native-svg";
import {
  BASH_LANGUAGES,
  MAX_READ_RESULT_PREVIEW,
  parseCommandRunSegments,
  parseContentSegments,
  parseFileActivitySegments,
  parseSkillTags,
  type CommandRunSegment,
  type FileActivitySegment,
} from "@/components/chat/messageBubble/contentParsers";
export {
  hasCodeBlockContent,
  hasFileActivityContent,
  parseCommandRunSegments,
  parseContentSegments,
} from "@/components/chat/messageBubble/contentParsers";

// NeonGlassBubbleWrapper removed in favor of PremiumMessageBubble

/** Replace span background-color highlights with text color using the provider's theme accent. */
function replaceHighlightWithTextColor(content: string, highlightColor: string): string {
  return content.replace(/style="([^"]+)"/gi, (match, inner) => {
    if (!/background-color\s*:/i.test(inner)) return match;
    const cleaned = inner
      .replace(/\s*background-color\s*:\s*[^;]+;?/gi, "")
      .replace(/\s*;\s*;\s*/g, ";")
      .replace(/^[\s;]+|[\s;]+$/g, "")
      .trim();
    return cleaned ? `style="color: ${highlightColor}; ${cleaned}"` : `style="color: ${highlightColor}"`;
  });
}


/** Collapsible "Thinking" / "Show reasoning" block. Default collapsed, 44px min touch target.
 * Uses accentSoft background + left accent border to distinguish from codeblocks (surfaceMuted).
 * Unfolds during generation; folds when generation finishes; stays folded until user opens it. */
// CollapsibleThinkingBlock removed in favor of ThinkingSection

/** Collapsible block for long read results (skill files, etc.). Shows preview + "Show more" / "Show less". */
function CollapsibleReadResult({
  content,
  previewLength,
  markdownStyles,
  theme,
  markdownRules,
  onLinkPress,
  wrapBareUrls,
  replaceHighlight,
}: {
  content: string;
  previewLength: number;
  markdownStyles: MarkdownProps["style"];
  theme: ReturnType<typeof useTheme>;
  markdownRules: MarkdownProps["rules"];
  onLinkPress: (url: string) => boolean;
  wrapBareUrls: (s: string) => string;
  replaceHighlight: (s: string, c: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > previewLength;
  const preview = isLong ? content.slice(0, previewLength).trimEnd() + "\n\n…" : content;
  const moreChars = content.length - previewLength;
  const displayContent = expanded ? content : preview;

  return (
    <Box style={isLong && !expanded ? { minHeight: 80 } : undefined}>
      <MarkdownContent
        content={wrapBareUrls(replaceHighlight(displayContent, theme.colors.accent))}
        markdownProps={{ style: markdownStyles, mergeStyle: true, rules: markdownRules ?? undefined }}
        onLinkPress={onLinkPress}
      />
      {isLong && (
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          className="py-3 pr-3 self-start min-h-11 justify-center active:opacity-80 rounded-lg"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show less" : `Show more, ${moreChars.toLocaleString()} more characters`}
        >
          <Text size="sm" className="text-primary-500 font-medium">
            {expanded ? "Show less" : `Show more (${moreChars.toLocaleString()} more characters)`}
          </Text>
        </Pressable>
      )}
    </Box>
  );
}

interface MessageBubbleProps {
  message: Message;
  /** When true, the bubble content is the "Terminated" label (muted style). */
  isTerminatedLabel?: boolean;
  /** When true and assistant content, show content in a small scrollable tail box (max height from tailBoxMaxHeight). */
  showAsTailBox?: boolean;
  /** Max height for the tail box (e.g. half screen). Only used when showAsTailBox is true. */
  tailBoxMaxHeight?: number;
  /** AI provider for assistant messages; shows Antigravity, Claude, or Codex icon when set. */
  provider?: string;
  /** When provided, links (including bare URLs) open in the app's internal browser instead of external. */
  onOpenUrl?: (url: string) => void;
  /** When provided, file: links (from Writing/Editing/Reading) open the file in explorer. */
  onFileSelect?: (path: string) => void;
  /** When true, the message is still being streamed; reasoning block unfolds during generation, folds when done. */
  isStreaming?: boolean;
}

interface MessageReferencePillProps {
  path: string;
  startLine: number;
  endLine: number;
}

function MessageReferencePill({ path, startLine, endLine }: MessageReferencePillProps) {
  const label = `${getFileName(path)} (${startLine === endLine ? startLine : `${startLine}-${endLine}`})`;
  return (
    <Box className="flex-row items-center gap-1 py-1 px-2 rounded bg-background-muted">
      <Text style={{ fontSize: 12, color: "#3B82F6" }}>◇</Text>
      <Text size="xs" numberOfLines={1} className="text-typography-700">
        {label}
      </Text>
    </Box>
  );
}

/** Shared message bubble colors — same logic for all providers (theme-driven). */
const TERMINAL_BG = "#1e293b";
const TERMINAL_TEXT = "rgba(255,255,255,0.9)";
const TERMINAL_PROMPT = "rgba(255,255,255,0.5)";

function MessageBubbleInner({ message, isTerminatedLabel, showAsTailBox, onOpenUrl, onFileSelect, isStreaming }: MessageBubbleProps) {
  const theme = useTheme();
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });
  const codeBlockBg = theme.colors.surfaceMuted;

  const bashHeaderBg = theme.colors.surfaceMuted;
  const terminalBg = TERMINAL_BG;
  const terminalBorder = theme.colors.border;
  const terminalText = TERMINAL_TEXT;
  const terminalPrompt = TERMINAL_PROMPT;
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const refs = message.codeReferences ?? [];
  const tailScrollRef = useRef<ScrollView>(null);
  const isDark = theme.mode === "dark";
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  const textColor = isDark
    ? (isUser ? "#FFFFFF" : "#E5FFFF")
    : (isUser ? theme.colors.textPrimary : theme.colors.textPrimary);
  const linkColor = isDark
    ? (isUser ? "#38BDF8" : "#00E5FF")
    : (isUser ? theme.colors.accent : theme.colors.accent); // Use standard accent for both to ensure readability on bright backgrounds

  const markdownStyles = useMemo(
    () => ({
      body: { color: textColor },
      text: { fontSize: 16, lineHeight: 24, color: textColor },
      paragraph: { marginTop: 2, marginBottom: 2 },
      heading1: { fontSize: 22, lineHeight: 30, fontWeight: "700" as const, color: textColor },
      heading2: { fontSize: 19, lineHeight: 28, fontWeight: "700" as const, color: textColor },
      heading3: { fontSize: 17, lineHeight: 24, fontWeight: "600" as const, color: textColor, marginTop: spacing["3"], marginBottom: spacing["1"] },
      heading4: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const, color: textColor },
      heading5: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: textColor },
      heading6: { fontSize: 14, lineHeight: 18, fontWeight: "600" as const, color: textColor },
      link: { color: linkColor, textDecorationLine: "underline" as const },
      code_inline: {
        color: linkColor,
        backgroundColor: isDark ? (isUser ? "rgba(56, 189, 248, 0.15)" : "rgba(0,229,255,0.15)") : theme.colors.accentSoft,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        fontSize: 14,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      },
      code_block: { color: textColor, backgroundColor: "transparent" },
      fence: { color: textColor, backgroundColor: "transparent" },
      blockquote: {
        backgroundColor: theme.colors.surfaceAlt,
        borderColor: theme.colors.accent,
        borderLeftWidth: 4,
        paddingHorizontal: spacing["3"],
        paddingVertical: spacing["2"],
        borderRadius: radii.sm,
      },
      strong: { fontWeight: "700" as const, color: textColor },
      bullet_list: {
        marginTop: spacing["2"],
        marginBottom: spacing["2"],
        paddingHorizontal: spacing["3"],
        paddingVertical: spacing["3"],
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      bullet_list_icon: { marginLeft: 0, marginRight: spacing["2"], marginTop: 2, fontSize: 16 },
      bullet_list_content: { flex: 1 },
      ordered_list: {
        marginTop: spacing["2"],
        marginBottom: spacing["2"],
        paddingHorizontal: spacing["3"],
        paddingVertical: spacing["3"],
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      ordered_list_icon: { marginLeft: 0, marginRight: spacing["2"], marginTop: 2, fontSize: 16 },
      ordered_list_content: { flex: 1 },
      list_item: {
        flexDirection: "row" as const,
        marginBottom: 4,
        minHeight: 22,
        alignItems: "flex-start" as const,
      },
    }),
    [theme, textColor, linkColor, isDark, isUser]
  );
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: "row" as const, alignItems: "flex-start", gap: 8, marginBottom: spacing["4"] },
        rowAssistant: { flexDirection: "column" as const, alignItems: "stretch" },
        rowUser: { flexDirection: "row" as const, justifyContent: "flex-end" },
        providerIconWrap: { width: 24, height: 24, marginBottom: 4 },
        bubble: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 0, // removed radius to let SVG handle corners
          backgroundColor: "transparent",
        },
        bubbleAssistant: {
          alignSelf: "stretch",
          marginHorizontal: -spacing["4"],
          paddingVertical: spacing["3"],
          paddingHorizontal: spacing["4"],
        },
        bubbleUser: {
          maxWidth: "85%",
          paddingVertical: spacing["3"],
          paddingHorizontal: 16,
        },
        bubbleSystem: {
          alignSelf: "center",
          paddingVertical: spacing["1"],
          marginVertical: spacing["1"],
        },
        bubbleText: { fontSize: 16, lineHeight: 24, color: theme.colors.textPrimary },
        bubbleTextUser: { fontSize: 16, lineHeight: 24, color: isDark ? "#FFFFFF" : theme.colors.textPrimary },
        bubbleTextSystem: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center" },
        bubbleTextTerminated: { color: theme.colors.textMuted, fontStyle: "italic" as const },
        bubbleTextPlaceholder: { color: theme.colors.textMuted, fontStyle: "italic" as const },
        fileActivityLine: { marginTop: 4, marginBottom: 4 },
        fileActivityFileName: { color: theme.colors.textPrimary, fontWeight: "600" as const },
        fileActivityContainer: {
          marginLeft: -18,
          paddingLeft: 8,
          paddingRight: 4,
        },
        fileActivityRow: {
          flexDirection: "row" as const,
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 14,
          marginBottom: 10,
          minHeight: 44,
          borderRadius: 8,
          borderLeftWidth: 4,
          gap: 10,
        },
        fileActivityRowRead: {
          backgroundColor: theme.mode === "dark" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.08)",
          borderLeftColor: "#3B82F6",
        },
        fileActivityRowEdit: {
          backgroundColor: theme.mode === "dark" ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.08)",
          borderLeftColor: "#F59E0B",
        },
        fileActivityRowWrite: {
          backgroundColor: theme.mode === "dark" ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.08)",
          borderLeftColor: "#10B981",
        },
        fileActivityActionLabel: { fontSize: 13, fontWeight: "700" as const },
        fileActivityActionRead: { color: theme.colors.info },
        fileActivityActionEdit: { color: theme.colors.warning },
        fileActivityActionWrite: { color: theme.colors.success },
        tailBoxScroll: { flexGrow: 0 },
        tailBoxContent: { paddingBottom: 12 },
        refPills: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
        refPillsWithContent: { marginTop: 10 },
        bashCodeBlockWrapper: {
          alignSelf: "stretch",
          marginVertical: 4,
          borderRadius: 8,
          overflow: "hidden" as const,
          backgroundColor: codeBlockBg,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        bashCodeBlockHeader: {
          flexDirection: "row" as const,
          alignItems: "center",
          justifyContent: "flex-end",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: bashHeaderBg,
        },
        bashCodeBlockHeaderSpacer: { flex: 1 },
        bashRunButton: {
          flexDirection: "row" as const,
          alignItems: "center",
          gap: 4,
          paddingVertical: 4,
          paddingHorizontal: 12,
          borderRadius: 6,
          backgroundColor: theme.colors.accent,
        },
        bashRunButtonPressed: { opacity: 0.85 },
        bashRunButtonText: { fontSize: 13, fontWeight: "600" as const, color: "#fff" },
        bashCodeBlock: { paddingHorizontal: 14, paddingVertical: 12 },
        commandRunSection: { marginVertical: 6, gap: 8, alignItems: "flex-start" as const },
        commandTerminalContainer: {
          alignSelf: "stretch" as const,
          width: "100%",
          maxWidth: "100%",
          borderWidth: 1,
          borderColor: terminalBorder,
          backgroundColor: terminalBg,
          borderRadius: 10,
          overflow: "hidden" as const,
        },
        commandTerminalHeader: {
          flexDirection: "row" as const,
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: terminalBorder,
        },
        commandTerminalTitle: { fontSize: 11, fontWeight: "700" as const, color: terminalPrompt, textTransform: "uppercase", letterSpacing: 0.5 },
        commandTerminalScrollBase: { overflow: "hidden" as const },
        commandTerminalContent: { paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 16 },
        commandTerminalLine: {
          flexDirection: "row" as const,
          alignItems: "flex-start",
          gap: 8,
          paddingVertical: 4,
          minHeight: 24,
        },
        commandTerminalPrompt: {
          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
          fontSize: 12,
          lineHeight: 18,
          color: theme.colors.accent,
          fontWeight: "700" as const,
        },
        commandTerminalText: {
          flex: 1,
          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
          fontSize: 12,
          lineHeight: 18,
          color: terminalText,
        },
        commandTerminalStatus: { fontSize: 10, lineHeight: 18, color: terminalPrompt, fontWeight: "600" as const },
      }),
    [theme, codeBlockBg, bashHeaderBg, terminalBg, terminalBorder, terminalText, terminalPrompt, isDark]
  );

  useEffect(() => {
    if (showAsTailBox && message.content) {
      tailScrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [showAsTailBox, message.content]);

  const handleMarkdownLinkPress = useCallback(
    (url: string): boolean => {
      if (url.startsWith("file:")) {
        const encodedPath = url.slice(5);
        let path = encodedPath;
        try {
          path = decodeURIComponent(encodedPath);
        } catch {
          path = encodedPath;
        }
        onFileSelect?.(path);
        return false;
      }
      if (onOpenUrl) {
        onOpenUrl(url);
        return false;
      }
      Linking.openURL(url);
      return false;
    },
    [onFileSelect, onOpenUrl]
  );

  const sanitizedContent = useMemo(
    () => collapseIdenticalCommandSteps(stripTrailingIncompleteTag(message.content ?? "")),
    [message.content]
  );
  const contentSegments = useMemo(
    () => parseContentSegments(sanitizedContent),
    [sanitizedContent]
  );

  const markdownRules = useMemo(() => {
    const base: Record<string, unknown> = {};
    if (!isUser && !isSystem) {
      base.text = (
        node: { key?: string; content?: string },
        children: React.ReactNode,
        _parent: unknown,
        mdStyles: Record<string, unknown>,
        inheritedStyles: Record<string, unknown> = {}
      ) => (
        <Text key={node.key} style={[inheritedStyles, mdStyles.text ?? markdownStyles.text]} selectable>
          {node.content ?? children}
        </Text>
      );
    }
    if (Object.keys(base).length === 0) return undefined;
    const rules: Record<string, unknown> = { ...base };
    rules.fence = (
      node: { key?: string; content?: string; sourceInfo?: string },
      _children: React.ReactNode,
      _parent: unknown,
      mdStyles: Record<string, unknown>,
      inheritedStyles: Record<string, unknown> = {}
    ) => {
      let content = node.content ?? "";
      if (typeof content === "string" && content.charAt(content.length - 1) === "\n") {
        content = content.substring(0, content.length - 1);
      }
      const lang = (node.sourceInfo ?? "").trim().toLowerCase().split(/\s/)[0] ?? "";
      const isBash = BASH_LANGUAGES.has(lang);
      const displayContent = isBash
        ? (extractBashCommandOnly(content) || content)
        : stripTrailingTerminalHeaderLines(content);

      const { height: screenHeight } = Dimensions.get("window");
      const maxHeight = screenHeight * 0.75;

      const segments = parseTextWithUrlSegments(displayContent);
      return (
        <Box key={node.key} style={[styles.bashCodeBlockWrapper, { maxHeight }]}>
          <ScrollView
            nestedScrollEnabled
            bounces={false}
            style={{ flexGrow: 0 }}
          >
            <ScrollView horizontal nestedScrollEnabled bounces={false} style={{ flexGrow: 0 }}>
              <Box style={[styles.bashCodeBlock, { alignSelf: "flex-start" }]}>
                <Text style={[inheritedStyles, mdStyles.fence ?? markdownStyles.fence]} selectable>
                  {segments.map((seg, i) =>
                    seg.type === "text" ? (
                      seg.value
                    ) : (
                      <Text
                        key={i}
                        style={{ color: theme.colors.accent, textDecorationLine: "underline" }}
                        onPress={() => handleMarkdownLinkPress(seg.value)}
                      >
                        {seg.value}
                      </Text>
                    )
                  )}
                </Text>
              </Box>
            </ScrollView>
          </ScrollView>
        </Box>
      );
    };
    return rules as MarkdownProps["rules"];
  }, [markdownStyles, styles, isUser, isSystem, theme.colors.accent, handleMarkdownLinkPress]);

  const getFileActivityRowStyle = useCallback(
    (prefix: string) => {
      const p = prefix.toLowerCase();
      if (p.includes("reading")) return [styles.fileActivityRow, styles.fileActivityRowRead];
      if (p.includes("editing")) return [styles.fileActivityRow, styles.fileActivityRowEdit];
      return [styles.fileActivityRow, styles.fileActivityRowWrite];
    },
    [styles]
  );

  const getFileActivityActionStyle = useCallback(
    (prefix: string) => {
      const p = prefix.toLowerCase();
      if (p.includes("reading")) return styles.fileActivityActionRead;
      if (p.includes("editing")) return styles.fileActivityActionEdit;
      return styles.fileActivityActionWrite;
    },
    [styles]
  );

  const FileActivityIcon = useCallback(
    ({ prefix }: { prefix: string }) => {
      const p = prefix.toLowerCase();
      const color =
        p.includes("reading") ? "#3B82F6"
          : p.includes("editing") ? "#F59E0B"
            : "#10B981";
      if (p.includes("reading")) return <BookOpenIcon color={color} />;
      if (p.includes("editing")) return <PencilIcon color={color} />;
      return <FilePenIcon color={color} />;
    },
    []
  );

  const renderActivitySegmentsContent = useCallback(
    (segments: FileActivitySegment[], keyPrefix: string = "root") => (
      <Box key={keyPrefix} style={styles.fileActivityContainer}>
        {segments.map((seg, index) => {
          if (seg.kind === "file") {
            const actionLabel = seg.prefix.replace(/^[📖✏️📝]\s*/, "") || "File";
            const actionColor = getFileActivityActionStyle(seg.prefix).color;
            return (
              <Box key={`${keyPrefix}-file-activity-${index}`} style={getFileActivityRowStyle(seg.prefix)}>
                <FileActivityIcon prefix={seg.prefix} />
                <Text size="sm" bold style={{ color: actionColor }}>
                  {actionLabel}
                </Text>
                <Pressable
                  className="flex-1 min-w-0 min-h-11 justify-center active:opacity-80 rounded-lg"
                  onPress={() => onFileSelect?.(seg.path)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open file ${seg.fileName}`}
                >
                  <Text size="md" bold numberOfLines={1} className="text-typography-900">
                    {seg.fileName}
                  </Text>
                </Pressable>
              </Box>
            );
          }
          if (!seg.text.trim()) {
            return <Box key={`${keyPrefix}-file-activity-space-${index}`} style={styles.fileActivityLine} />;
          }
          if (seg.text.length > MAX_READ_RESULT_PREVIEW) {
            return (
              <CollapsibleReadResult
                key={`${keyPrefix}-file-activity-text-${index}`}
                content={seg.text}
                previewLength={MAX_READ_RESULT_PREVIEW}
                markdownStyles={markdownStyles}
                theme={theme}
                markdownRules={markdownRules ?? undefined}
                onLinkPress={handleMarkdownLinkPress}
                wrapBareUrls={wrapBareUrlsInMarkdown}
                replaceHighlight={replaceHighlightWithTextColor}
              />
            );
          }
          return (
            <MarkdownContent
              key={`${keyPrefix}-file-activity-text-${index}`}
              content={wrapBareUrlsInMarkdown(replaceHighlightWithTextColor(seg.text, theme.colors.accent))}
              markdownProps={{ style: markdownStyles, mergeStyle: true, rules: markdownRules }}
              onLinkPress={handleMarkdownLinkPress}
            />
          );
        })}
      </Box>
    ),
    [
      FileActivityIcon,
      getFileActivityRowStyle,
      getFileActivityActionStyle,
      handleMarkdownLinkPress,
      markdownRules,
      markdownStyles,
      onFileSelect,
      styles,
      theme.colors.accent,
    ]
  );

  const renderRichContent = useCallback(
    (textContent: string) => {
      const commandRunSegments = parseCommandRunSegments(textContent);
      const hasCommandRunSegments = commandRunSegments.some((s) => (s as { kind?: string }).kind === "command");
      const fileActivitySegments = parseFileActivitySegments(textContent);
      const hasRawFileActivityLinks = fileActivitySegments.some((seg) => seg.kind === "file");

      let markdownContent = replaceHighlightWithTextColor(textContent, theme.colors.accent);
      for (let i = 0; i < 8; i++) {
        const next = fillEmptyBashBlocks(markdownContent);
        if (next === markdownContent) break;
        markdownContent = next;
      }

      if (hasCommandRunSegments) {
        const nodes: React.ReactNode[] = [];
        let commandGroup: CommandRunSegment[] = [];
        const COMMAND_LINE_HEIGHT = 32;
        const flushCommandGroup = (key: string) => {
          if (commandGroup.length === 0) return;
          const cmds = [...commandGroup];
          commandGroup = [];
          const hasOutput = cmds.some((c) => !!c.output);
          const visibleLines = Math.min(Math.max(cmds.length, 3), 6);
          const outputLineCount = hasOutput
            ? cmds.reduce((n, c) => n + (c.output ? c.output.trim().split(/\r?\n/).length : 0), 0)
            : 0;
          const scrollHeight = hasOutput
            ? Math.min(320, Math.max(80, outputLineCount * 24 + 48))
            : visibleLines * COMMAND_LINE_HEIGHT;
          nodes.push(
            <Box
              key={key}
              style={styles.commandTerminalContainer}
            >
              <Box style={styles.commandTerminalHeader}>
                <Box className="flex-row items-center gap-2">
                  <TerminalIcon color={theme.colors.accent} size={14} strokeWidth={2} />
                  <Text size="sm" bold className="text-typography-500">
                    Commands • {cmds.length}
                  </Text>
                </Box>
              </Box>
              <ScrollView
                style={[styles.commandTerminalScrollBase, hasOutput ? { maxHeight: scrollHeight } : { height: scrollHeight }]}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.commandTerminalContent} nestedScrollEnabled>
                  <Box className="flex-1 min-w-full pr-10">
                    {cmds.map((cmd, i) => (
                      <Box key={`line-${i}`}>
                        <Box style={styles.commandTerminalLine} className="flex-row items-center gap-1">
                          <Text style={styles.commandTerminalPrompt} selectable={false}>
                            $
                          </Text>
                          <Text style={[styles.commandTerminalText, { flex: 0 }]} selectable numberOfLines={cmd.output ? undefined : 1} ellipsizeMode="tail">
                            {cmd.command}
                          </Text>
                          {!!cmd.status && (
                            <Badge action={cmd.status === "Failed" ? "error" : "success"} variant="solid" size="sm" className="ml-1.5">
                              <BadgeText>{cmd.status}{cmd.exitCode != null ? ` (${cmd.exitCode})` : ""}</BadgeText>
                            </Badge>
                          )}
                        </Box>
                        {cmd.output ? (
                          <Box className="mt-1 mb-2 pl-3">
                            <Text style={[styles.commandTerminalText, { color: "rgba(255,255,255,0.7)", opacity: 0.8, flex: 0 }]} selectable>
                              {parseTextWithUrlSegments(cmd.output).map((seg, i) =>
                                seg.type === "text" ? (
                                  seg.value
                                ) : (
                                  <Text
                                    key={i}
                                    style={{ color: "#7dd3fc", textDecorationLine: "underline" }}
                                    onPress={() => handleMarkdownLinkPress(seg.value)}
                                  >
                                    {seg.value}
                                  </Text>
                                )
                              )}
                            </Text>
                          </Box>
                        ) : null}
                      </Box>
                    ))}
                  </Box>
                </ScrollView>
              </ScrollView>
            </Box>
          );
        };
        let cmdKey = 0;
        commandRunSegments.forEach((seg, index) => {
          if ((seg as CommandRunSegment).kind === "command") {
            commandGroup.push(seg as CommandRunSegment);
          } else {
            flushCommandGroup(`terminal-${cmdKey++}`);
            const textSection = (seg as { type: "markdown"; content: string }).content;
            const subSegments = parseFileActivitySegments(textSection);
            if (subSegments.some((s) => s.kind === "file")) {
              nodes.push(renderActivitySegmentsContent(subSegments, `mixed-file-${index}`));
            } else {
              nodes.push(
                <MarkdownContent
                  key={`md-${index}`}
                  content={wrapBareUrlsInMarkdown(
                    replaceHighlightWithTextColor(textSection, theme.colors.accent)
                  )}
                  markdownProps={{ style: markdownStyles, mergeStyle: true, rules: markdownRules }}
                  onLinkPress={handleMarkdownLinkPress}
                />
              );
            }
          }
        });
        flushCommandGroup(`terminal-${cmdKey}`);
        return <Box style={styles.commandRunSection}>{nodes}</Box>;
      } else if (hasRawFileActivityLinks) {
        return renderActivitySegmentsContent(fileActivitySegments, "root");
      } else {
        return (
          <MarkdownContent
            content={wrapBareUrlsInMarkdown(markdownContent)}
            markdownProps={{ style: markdownStyles, mergeStyle: true, rules: markdownRules }}
            onLinkPress={handleMarkdownLinkPress}
          />
        );
      }
    },
    [
      renderActivitySegmentsContent,
      handleMarkdownLinkPress,
      markdownRules,
      markdownStyles,
      styles,
      terminalPrompt,
      terminalText,
      theme.colors.accent,
    ]
  );
  const showProviderIcon = false; // Unified theme has no brand icons in bubbles
  const ProviderIcon = CodexIcon; // Default fallback if needed

  const isLatestThinkingBlock = useCallback((index: number) => {
    const isThinking = contentSegments[index]?.type === "thinking";
    if (!isThinking) return false;

    // It is the latest if there are no more 'thinking' blocks after it
    const hasMoreThinking = contentSegments.slice(index + 1).some(seg => seg.type === "thinking");
    return !hasMoreThinking;
  }, [contentSegments]);

  const bubbleContent = (
    <>
      {isTerminatedLabel ? (
        <Text style={styles.bubbleTextTerminated} italic className="text-typography-500">
          Terminated
        </Text>
      ) : (message.content && message.content.trim() !== "" ? (
        isUser || isSystem ? (
          (() => {
            if (isSystem) {
              return (
                <Text style={styles.bubbleTextSystem}>
                  {message.content}
                </Text>
              );
            }
            // User message: parse <skill> tags into chips
            const skillSegments = parseSkillTags(message.content!);
            const hasSkillTags = skillSegments.some(s => s.type === "skill");
            if (!hasSkillTags) {
              return (
                <Text style={styles.bubbleTextUser}>
                  {message.content}
                </Text>
              );
            }
            return (
              <RNView style={{ flexDirection: "column", gap: 6 }}>
                <RNView style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                  {skillSegments.filter(s => s.type === "skill").map((seg, i) => (
                    <RNView
                      key={`skill-${i}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: "rgba(56, 189, 248, 0.2)",
                        borderColor: "rgba(56, 189, 248, 0.5)",
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        gap: 3,
                      }}
                    >
                      <VibeIcon size={14} />
                      <Text style={{ color: "#38BDF8", fontSize: 11, fontWeight: "600" }}>
                        {seg.type === "skill" ? seg.name : ""}
                      </Text>
                    </RNView>
                  ))}
                </RNView>
                {(() => {
                  const textValue = skillSegments
                    .filter(s => s.type === "text")
                    .map(s => s.type === "text" ? s.value : "")
                    .join("")
                    .trim();
                  if (!textValue) return null;
                  return (
                    <Text style={styles.bubbleTextUser}>
                      {textValue}
                    </Text>
                  );
                })()}
              </RNView>
            );
          })()
        ) : (
          <>
            {contentSegments.map((seg, i) => (
              seg.type === "thinking" ? (
                <ThinkingSection
                  key={`seg-${i}`}
                  content={seg.content}
                  theme={theme}
                  renderContent={renderRichContent}
                  initiallyExpanded={isLatestThinkingBlock(i) && !!isStreaming}
                  isLoading={isLatestThinkingBlock(i) && !!isStreaming}
                />
              ) : (
                <Box key={`seg-${i}`}>
                  {renderRichContent(seg.content)}
                </Box>
              )
            ))}
          </>
        )
      ) : !isUser && !isSystem ? (
        <Box className="py-2 px-1">
          <TypingIndicator color={theme.colors.textMuted} dotSize={6} />
        </Box>
      ) : null)}
      {refs.length > 0 && (
        <Box style={[styles.refPills, message.content ? styles.refPillsWithContent : null]} className="flex-row flex-wrap gap-2">
          {refs.map((ref, index) => (
            <MessageReferencePill
              key={`${ref.path}-${ref.startLine}-${index}`}
              path={ref.path}
              startLine={ref.startLine}
              endLine={ref.endLine}
            />
          ))}
        </Box>
      )}
    </>
  );

  const bubbleLayoutProps = {};

  return (
    <Animated.View
      entering={FadeInDown.duration(400).easing(Easing.out(Easing.cubic))}
      layout={LinearTransition.duration(400).easing(Easing.out(Easing.cubic))}
    >
      <Box
        style={[
          styles.row,
          isUser && styles.rowUser,
          showProviderIcon && styles.rowAssistant,
        ]}
        className="flex-row"
      >
        {!!showProviderIcon && (
          <Box style={styles.providerIconWrap} className="items-center justify-center pr-2">
            <ProviderIcon size={24} color={theme.colors.accent} />
          </Box>
        )}
        <Pressable
          onLongPress={() => {
            triggerHaptic("heavy");
            setIsToolbarVisible(true);
          }}
          onPress={() => {
            if (isToolbarVisible) setIsToolbarVisible(false);
          }}
          onLayout={(e) => setBubbleSize(e.nativeEvent.layout)}
          style={[
            styles.bubble,
            isUser && styles.bubbleUser,
            isSystem && styles.bubbleSystem,
            !isUser && !isSystem && styles.bubbleAssistant,
          ]}
        >
          {!isSystem && bubbleSize.width > 0 && bubbleSize.height > 0 && (
            <PremiumMessageBubble isUser={isUser} width={bubbleSize.width} height={bubbleSize.height} />
          )}
          <MessageActionToolbar
            isVisible={isToolbarVisible}
            isUser={isUser}
            onCopy={async () => {
              if (message.content) {
                await Clipboard.setStringAsync(message.content);
                triggerHaptic("success");
              }
              setIsToolbarVisible(false);
            }}
          />
          {bubbleContent}
        </Pressable>
      </Box>
    </Animated.View>
  );
}

export const MessageBubble = React.memo(MessageBubbleInner);
