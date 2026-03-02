import {
  ClaudeIcon, CodexIcon, GeminiIcon
} from "@/components/icons/ProviderIcons";
import { ActionsheetOptionRow } from "@/components/reusable/ActionsheetOptionRow";
import { Box } from "@/components/ui/box";
import { Text as GluestackText } from "@/components/ui/text";
import { type Provider } from "@/core/modelOptions";
import { triggerHaptic } from "@/designSystem";
import { getTheme } from "@/theme/index";
import { BottomSheetBackdrop, BottomSheetBackgroundProps, BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ModelOption = { value: string; label: string };

interface ModelPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  provider: Provider;
  model: string;
  themeMode: "light" | "dark";
  providerModelOptions: Record<Provider, ModelOption[]>;
  onProviderChange: (provider: Provider) => void;
  onModelChange: (model: string) => void;
}

export function ModelPickerSheet({
  isOpen,
  onClose,
  provider,
  model,
  themeMode,
  providerModelOptions,
  onProviderChange,
  onModelChange,
}: ModelPickerSheetProps) {
  const providers: Provider[] = ["claude", "gemini", "codex"];
  const currentProvider = provider;
  const { bottom } = useSafeAreaInsets();
  const isDark = themeMode === "dark";
  const theme = getTheme();

  const sectionSurface = isDark
    ? theme.colors.surfaceAlt
    : theme.colors.surfaceAlt;
  const sectionBorder = isDark
    ? theme.colors.border
    : theme.colors.border;
  const headingColor = isDark ? theme.colors.textPrimary : theme.colors.textPrimary;
  const mutedHeadingColor = isDark ? theme.colors.textMuted : theme.colors.textMuted;

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (isOpen) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [isOpen]);

  const snapPoints = useMemo(() => ["50%", "85%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
        style={[props.style, { backgroundColor: theme.colors.overlay }]}
      />
    ),
    [theme.colors.overlay]
  );

  const renderBackground = useCallback(
    ({ style }: BottomSheetBackgroundProps) => (
      <View
        style={[
          style,
          {
            overflow: "hidden",
            borderTopLeftRadius: isDark ? 24 : 32,
            borderTopRightRadius: isDark ? 24 : 32,
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.85)" : theme.colors.surface,
            borderWidth: 1,
            borderColor: sectionBorder,
          },
        ]}
      >
        {isDark ? (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
        )}
      </View>
    ),
    [isDark, theme.colors.surface, sectionBorder]
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundComponent={renderBackground}
      handleIndicatorStyle={{
        backgroundColor: isDark ? "rgba(216, 235, 255, 0.48)" : theme.colors.border,
      }}
    >
      <Box className="w-full px-4 pb-4 pt-1">
        <GluestackText size="md" bold style={{ color: headingColor }}>
          Select Model
        </GluestackText>
        <GluestackText
          size="xs"
          style={{ color: mutedHeadingColor, marginTop: 4 }}
        >
          Choose provider and model for this chat session
        </GluestackText>
      </Box>
      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(bottom, 24) + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {providers.map((p) => {
          const opts = providerModelOptions[p];
          if (!opts || opts.length === 0) return null;

          const ProviderIcon = p === "claude" ? ClaudeIcon : p === "gemini" ? GeminiIcon : CodexIcon;

          const accent = theme.colors.accent;
          const isActiveModel = (entryModel: string) =>
            provider === p && model === entryModel;

          return (
            <Box
              key={p}
              className="mb-3 rounded-2xl p-2"
              style={{
                backgroundColor: sectionSurface,
                borderWidth: 1,
                borderColor: currentProvider === p ? accent : sectionBorder,
              }}
            >
              <Box className="flex-row items-center gap-2 mb-1 px-2">
                <ProviderIcon size={18} color={accent} />
                <GluestackText size="sm" bold style={{ color: headingColor }}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </GluestackText>
              </Box>
              {opts.map((opt) => {
                const selected = isActiveModel(opt.value);
                return (
                  <ActionsheetOptionRow
                    key={opt.value}
                    label={opt.label}
                    selected={selected}
                    minHeight={40}
                    itemClassName="rounded-xl"
                    itemStyle={({ pressed }) => ({
                      paddingVertical: 4,
                      borderWidth: 1,
                      borderColor: selected ? accent : "transparent",
                      backgroundColor: selected
                        ? isDark
                          ? theme.colors.skeletonHighlight
                          : `${accent}1A`
                        : pressed
                          ? isDark
                            ? theme.colors.skeleton
                            : theme.colors.surfaceMuted
                          : "transparent",
                    })}
                    labelStyle={{
                      color: selected ? accent : mutedHeadingColor,
                      fontWeight: selected ? "700" : "500",
                      fontSize: 14,
                    }}
                    selectedIndicatorLabel="Selected"
                    selectedIndicatorStyle={{ color: accent }}
                    onPress={() => {
                      triggerHaptic("selection");
                      if (currentProvider !== p) onProviderChange(p);
                      onModelChange(opt.value);
                      onClose();
                    }}
                  />
                );
              })}
            </Box>
          );
        })}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
