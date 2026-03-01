import { EntranceAnimation } from "@/designSystem";
import React, { memo } from "react";
import { Dimensions, type TextStyle, type ViewStyle } from "react-native";

import CodeLineRow from "@/components/reusable/CodeLineRow";
import { Box } from "@/components/ui/box";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import type { DesignTheme } from "@/theme/index";
import { useTheme } from "@/theme/index";

type FileHeaderProps = {
  headerLabel: string;
  displayFileName: string;
  onClose: () => void;
};

export function FileViewerHeader({ headerLabel, displayFileName, onClose }: FileHeaderProps) {
  const theme = useTheme();
  return (
    <Box
      className="flex-row items-center justify-between min-h-12 px-4 py-2.5 border-b border-outline-500"
      style={{ backgroundColor: theme.colors.surfaceAlt }}
    >
      <Box className="mr-3 min-w-0 flex-1">
        <Text className="text-[11px] mb-0.5 uppercase tracking-widest text-text-secondary">{headerLabel}</Text>
        <Text className="text-[15px] font-semibold" style={{ color: theme.colors.textPrimary }} numberOfLines={1} ellipsizeMode="middle">
          {displayFileName}
        </Text>
      </Box>
      <Pressable
        onPress={onClose}
        className="h-11 w-11 items-center justify-center"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Close file viewer"
        accessibilityRole="button"
      >
        <Text className="text-[18px] text-text-secondary">✕</Text>
      </Pressable>
    </Box>
  );
}

export type CodeLineRecord = {
  id: string;
  lineContent: string;
  index: number;
};

type FileViewerCodeLineProps = {
  item: CodeLineRecord;
  isDiffMode: boolean;
  isDarkMode: boolean;
  language: string;
  isSelected: boolean;
  onLinePress: (lineIndex: number) => void;
  theme: DesignTheme;
  codeBaseStyle: TextStyle;
  lineNumStyle: TextStyle;
  lineNumSelectedStyle: TextStyle;
  lineRowStyle: ViewStyle;
  selectedLineStyle: ViewStyle;
  lineNumSelectedContainerStyle: ViewStyle;
  lineNumContainerStyle: ViewStyle;
  codeContainerStyle: ViewStyle;
};

const fileViewerCodeLineRenderCounts = new Map<string, number>();

function FileViewerCodeLineInner({
  item,
  isDiffMode,
  isDarkMode,
  language,
  isSelected,
  onLinePress,
  theme,
  codeBaseStyle,
  lineNumStyle,
  lineNumSelectedStyle,
  lineRowStyle,
  selectedLineStyle,
  lineNumSelectedContainerStyle,
  lineNumContainerStyle,
  codeContainerStyle,
}: FileViewerCodeLineProps) {
  if (__DEV__) {
    const previous = fileViewerCodeLineRenderCounts.get(item.id) ?? 0;
    const next = previous + 1;
    fileViewerCodeLineRenderCounts.set(item.id, next);
    if (next === 1 || next % 20 === 0) {
      console.debug("[FileViewerCodeLine] render", item.id, { count: next });
    }
  }

  let diffStyle: ViewStyle | undefined;
  if (isDiffMode) {
    if (item.lineContent.startsWith("+") && !item.lineContent.startsWith("+++")) {
      diffStyle = {
        backgroundColor:
          theme.mode === "dark" ? "rgba(34, 197, 94, 0.25)" : "rgba(34, 197, 94, 0.15)",
      };
    } else if (item.lineContent.startsWith("-") && !item.lineContent.startsWith("---")) {
      diffStyle = {
        backgroundColor:
          theme.mode === "dark" ? "rgba(239, 68, 68, 0.25)" : "rgba(239, 68, 68, 0.15)",
      };
    } else if (item.lineContent.startsWith("@@ ")) {
      diffStyle = {
        backgroundColor:
          theme.mode === "dark" ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.1)",
      };
    }
  }

  return (
    <CodeLineRow
      index={item.index}
      lineContent={item.lineContent}
      selected={isSelected}
      language={language}
      isDarkMode={isDarkMode}
      onPress={() => onLinePress(item.index)}
      lineBaseStyle={codeBaseStyle}
      lineNumStyle={lineNumStyle}
      lineNumSelectedStyle={lineNumSelectedStyle}
      lineRowStyle={lineRowStyle}
      selectedLineStyle={selectedLineStyle}
      lineNumSelectedContainerStyle={lineNumSelectedContainerStyle}
      lineNumContainerStyle={lineNumContainerStyle}
      codeContainerStyle={codeContainerStyle}
      diffStyle={diffStyle}
    />
  );
}

export const FileViewerCodeLine = memo(
  FileViewerCodeLineInner,
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.lineContent === next.item.lineContent &&
    prev.isSelected === next.isSelected &&
    prev.isDiffMode === next.isDiffMode &&
    prev.isDarkMode === next.isDarkMode &&
    prev.language === next.language &&
    prev.onLinePress === next.onLinePress &&
    prev.theme.mode === next.theme.mode &&
    prev.codeBaseStyle === next.codeBaseStyle &&
    prev.lineNumStyle === next.lineNumStyle &&
    prev.lineNumSelectedStyle === next.lineNumSelectedStyle &&
    prev.lineRowStyle === next.lineRowStyle &&
    prev.selectedLineStyle === next.selectedLineStyle &&
    prev.lineNumSelectedContainerStyle === next.lineNumSelectedContainerStyle &&
    prev.lineNumContainerStyle === next.lineNumContainerStyle &&
    prev.codeContainerStyle === next.codeContainerStyle
);

type SelectionFooterProps = {
  hasSelection: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  onAddToPrompt: () => void;
  onClearSelection: () => void;
  theme: DesignTheme;
};

export function FileViewerSelectionFooter({
  hasSelection,
  selectionStart,
  selectionEnd,
  onAddToPrompt,
  onClearSelection,
  theme,
}: SelectionFooterProps) {
  if (!hasSelection) return null;

  return (
    <EntranceAnimation variant="fade" duration={300}>
      <Box
        className="flex-row items-center gap-2.5 px-4 py-2 border-b border-outline-500"
        style={{ backgroundColor: theme.colors.accentSoft }}
      >
        <Text className="text-xs" style={{ color: theme.colors.textPrimary }}>
          {selectionStart === selectionEnd
            ? `Line ${selectionStart}`
            : `Lines ${selectionStart}-${selectionEnd}`}
        </Text>
        <Pressable
          className="min-h-11 justify-center px-3 py-1.5 rounded-lg bg-text-primary"
          onPress={onAddToPrompt}
          accessibilityLabel="Add selected lines to prompt"
          accessibilityRole="button"
        >
          <Text className="text-sm text-text-inverse font-semibold">Add to prompt</Text>
        </Pressable>
        <Pressable
          className="min-h-11 justify-center px-2 py-1.5"
          onPress={onClearSelection}
          accessibilityLabel="Clear selected lines"
          accessibilityRole="button"
        >
          <Text className="text-sm" style={{ color: theme.colors.textSecondary }}>
            Cancel
          </Text>
        </Pressable>
      </Box>
    </EntranceAnimation>
  );
}

type ImageViewerProps = {
  imageUri: string;
  imageScale: number;
  zoomOut: () => void;
  zoomIn: () => void;
  zoomReset: () => void;
  theme: DesignTheme;
};

export const FileViewerImageViewer = memo(function FileViewerImageViewer({
  imageUri,
  imageScale,
  zoomOut,
  zoomIn,
  zoomReset,
  theme,
}: ImageViewerProps) {
  return (
    <Box className="flex-1">
      <Box className="flex-row items-center justify-center gap-6 py-2.5 px-4 border-b border-outline-500" style={{ backgroundColor: theme.colors.surfaceAlt }}>
        <Pressable
          className="w-11 h-11 rounded-full items-center justify-center"
          style={{ backgroundColor: theme.colors.border }}
          onPress={zoomOut}
          accessibilityLabel="Zoom out"
          accessibilityRole="button"
        >
          <Text className="text-2xl font-light" style={{ color: theme.colors.textPrimary }}>
            −
          </Text>
        </Pressable>
        <Pressable
          className="min-h-11 min-w-16 items-center justify-center"
          onPress={zoomReset}
          accessibilityLabel="Reset zoom"
          accessibilityRole="button"
        >
          <Text className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
            {Math.round(imageScale * 100)}%
          </Text>
        </Pressable>
        <Pressable
          className="w-11 h-11 rounded-full items-center justify-center"
          style={{ backgroundColor: theme.colors.border }}
          onPress={zoomIn}
          accessibilityLabel="Zoom in"
          accessibilityRole="button"
        >
          <Text className="text-2xl font-light" style={{ color: theme.colors.textPrimary }}>
            +
          </Text>
        </Pressable>
      </Box>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow items-center justify-center p-4"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // @ts-ignore webview-safe fallback for native-scroll container behavior
        style={{ backgroundColor: theme.colors.surfaceAlt }}
      >
        <Box style={{ alignSelf: "center", width: Dimensions.get("window").width - 32, transform: [{ scale: imageScale }] }}>
          <Image
            source={{ uri: imageUri }}
            style={{
              width: "100%",
              minHeight: 200,
              maxWidth: Dimensions.get("window").width - 32,
            }}
            resizeMode="contain"
          />
        </Box>
      </ScrollView>
    </Box>
  );
});
