import {
  AttachPlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  DockerIcon,
  GlobeIcon,
  SkillIcon,
  VibeIcon,
  StopCircleIcon,
  TerminalIcon
} from "@/components/icons/ChatActionIcons";
import { ClaudeSendIcon, CodexEnterIcon, GeminiSendIcon } from "@/components/icons/ProviderIcons";
import { getCategoryIcon } from "@/components/icons/SkillCategoryIcons";
import { ActionIconButton } from "@/components/reusable/ActionIconButton";
import { ScaleWrapper } from "@/components/reusable/ScaleWrapper";
import { PremiumInputContainer } from "@/components/chat/PremiumInputContainer";
import { SkillHubPopover } from "@/components/chat/SkillHubPopover";
import { SystemMenuPopover } from "@/components/chat/SystemMenuPopover";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Button, ButtonIcon } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import { VStack } from "@/components/ui/vstack";
import { Popover, PopoverBackdrop, PopoverContent } from "@/components/ui/popover";
import { Menu, MenuItem } from "@/components/ui/menu";
import { type Provider } from "@/core/modelOptions";
import { EntranceAnimation, triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import { cn } from "@/utils/cn";
import { getFileName } from "@/utils/path";
import { CATEGORY_COLORS, CATEGORY_COLORS_LIGHT, type Category } from "@/utils/skillColors";
import { BlurView } from "expo-blur";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Dimensions, Keyboard, Modal, Platform, ScrollView, StyleSheet, TouchableWithoutFeedback, View as RNView } from "react-native";
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";

const DEFAULT_PLACEHOLDER = "How can I help you today?";
const INPUT_PLACEHOLDER = "Type your response…";
const LINE_HEIGHT = 24;
const MAX_LINES = 4;
const MAX_INPUT_HEIGHT = LINE_HEIGHT * MAX_LINES;
const DEFAULT_INPUT_HEIGHT = LINE_HEIGHT + 8;
const INPUT_VERTICAL_PADDING = 16;

export type PendingCodeRef = {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
};

export interface InputPanelProps {
  connected: boolean;
  sessionRunning: boolean;
  waitingForUserInput: boolean;
  permissionMode: string | null;
  onSubmit: (prompt: string, permissionMode?: string) => void;
  pendingCodeRefs?: PendingCodeRef[];
  onRemoveCodeRef?: (index: number) => void;
  onTerminateAgent?: () => void;
  onOpenWebPreview?: () => void;
  onOpenProcesses?: () => void;
  provider?: Provider;
  model?: string;
  modelOptions?: { value: string; label: string }[];
  onOpenModelPicker?: () => void;
  onOpenSkillsConfig?: () => void;
  onOpenDocker?: () => void;
  serverBaseUrl?: string;
}

export function InputPanel({
  connected,
  sessionRunning,
  waitingForUserInput,
  permissionMode,
  onSubmit,
  pendingCodeRefs = [],
  onRemoveCodeRef,
  onTerminateAgent,
  onOpenWebPreview,
  onOpenProcesses,
  provider = "codex",
  model = "gpt-5.1-codex-mini",
  modelOptions = [],
  onOpenModelPicker,
  onOpenSkillsConfig,
  onOpenDocker,
  serverBaseUrl,
}: InputPanelProps) {
  const theme = useTheme();
  const [prompt, setPrompt] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [terminalMenuVisible, setTerminalMenuVisible] = useState(false);
  const [skillMenuVisible, setSkillMenuVisible] = useState(false);
  const [enabledSkills, setEnabledSkills] = useState<{ id: string; name: string; category?: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<{ id: string; name: string; category?: string }[]>([]);

  const categories = useMemo(() => {
    return Array.from(new Set(enabledSkills.map((skill) => skill.category || "Uncategorized"))).sort();
  }, [enabledSkills]);

  useEffect(() => {
    if (categories.length > 0 && (!selectedCategory || !categories.includes(selectedCategory))) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);
  const [inputHeight, setInputHeight] = useState(DEFAULT_INPUT_HEIGHT);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const triggerLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const skillTriggerLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const maxSkillCategoryHeight = 180;

  const fetchEnabledSkills = useCallback(() => {
    if (!serverBaseUrl) return;
    setSkillsLoading(true);
    Promise.all([
      fetch(`${serverBaseUrl}/api/skills`).then((response) => response.json()),
      fetch(`${serverBaseUrl}/api/skills-enabled`).then((response) => response.json())
    ]).then(([allData, enabledData]) => {
      const enabledSet = new Set(enabledData?.enabledIds || []);
      const allSkills = allData?.skills || [];
      setEnabledSkills(allSkills.filter((skill: any) => enabledSet.has(skill.id)));
    }).catch((error) => { console.error('[SkillHub] Failed to fetch skills:', error); }).finally(() => setSkillsLoading(false));
  }, [serverBaseUrl]);

  const sendScale = useSharedValue(1);
  const sendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  const handlePressIn = useCallback(() => {
    sendScale.value = withTiming(0.92, { duration: 100 });
  }, [sendScale]);
  const handlePressOut = useCallback(() => {
    sendScale.value = withSpring(1, { damping: 10, stiffness: 300 });
  }, [sendScale]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  const currentModelLabel =
    modelOptions.find((modelOption) => modelOption.value === model)?.label ??
    (model?.startsWith("claude-") ? model.slice(7) : model ?? "");

  const disabled = !waitingForUserInput && sessionRunning;
  const placeholder = waitingForUserInput ? INPUT_PLACEHOLDER : DEFAULT_PLACEHOLDER;

  const handleContentSizeChange = useCallback(
    (_evt: { nativeEvent: { contentSize: { height: number } } }) => {
      const h = _evt.nativeEvent.contentSize.height;
      setInputHeight(Math.min(Math.max(h, DEFAULT_INPUT_HEIGHT), MAX_INPUT_HEIGHT));
    },
    []
  );

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed && !pendingCodeRefs.length && !selectedSkills.length) return;
    Keyboard.dismiss();
    triggerHaptic("medium");
    // Wrap prompt with <skill> tags for each selected skill
    const skillPrefix = selectedSkills.length > 0
      ? selectedSkills.map((skill) => `<skill>Use ${skill.name}</skill>`).join(" ") + " "
      : "";
    const finalPrompt = skillPrefix + trimmed;
    if (waitingForUserInput && sessionRunning) {
      onSubmit(finalPrompt, permissionMode ?? undefined);
      setPrompt("");
      setSelectedSkills([]);
      setInputHeight(DEFAULT_INPUT_HEIGHT);
      return;
    }
    if (sessionRunning) return;
    onSubmit(finalPrompt || "See code references below.", permissionMode ?? undefined);
    setPrompt("");
    setSelectedSkills([]);
    setInputHeight(DEFAULT_INPUT_HEIGHT);
  }, [prompt, pendingCodeRefs.length, selectedSkills, waitingForUserInput, sessionRunning, permissionMode, onSubmit]);

  const isDark = theme.mode === "dark";
  const inputTextColor = theme.colors.textPrimary;
  const placeholderColor = theme.colors.textMuted;

  return (
    <Box>
      <VStack
        space="md"
        className={cn(
          "flex-col gap-3 px-4 mt-6",
          Platform.OS === "android" ? "py-4 pb-5" : "py-3"
        )}
        onLayout={(e) => setPanelSize(e.nativeEvent.layout)}
        style={{ backgroundColor: "transparent" }}
      >
        {panelSize.width > 0 && panelSize.height > 0 && (
          <PremiumInputContainer width={panelSize.width} height={panelSize.height} />
        )}
        {(pendingCodeRefs.length > 0 || selectedSkills.length > 0) && (
          <HStack space="sm" className="flex-row flex-wrap gap-1 mb-0.5">
            {selectedSkills.map((skill, idx) => {
              const skillCategory = (skill.category as Category) ?? "Development";
              const palette = isDark ? CATEGORY_COLORS : CATEGORY_COLORS_LIGHT;
              const skillColor = palette[skillCategory]?.text ?? (isDark ? "#38BDF8" : "#0EA5E9");
              const skillBg = palette[skillCategory]?.active ?? (isDark ? "rgba(56, 189, 248, 0.15)" : "rgba(14, 165, 233, 0.10)");

              const skillChip = (
                <Badge action="success" variant="solid" size="sm" className="pr-0.5"
                  style={{
                    backgroundColor: skillBg,
                    borderColor: skillColor + "80", // 50% opacity border
                    borderWidth: 1,
                    borderRadius: 14,
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                  }}
                >
                  <VibeIcon size={14} />
                  <BadgeText style={{ color: skillColor, marginLeft: 3, fontWeight: "600", fontSize: 10 }}>
                    {skill.name}
                  </BadgeText>
                  <Pressable
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    onPress={() => {
                      triggerHaptic("selection");
                      setSelectedSkills(prev => prev.filter(s => s.id !== skill.id));
                    }}
                    className="items-center justify-center ml-1"
                    style={{ minWidth: 16, minHeight: 16 }}
                    accessibilityLabel={`Remove ${skill.name} skill`}
                  >
                    <Box
                      className="w-4 h-4 rounded-full items-center justify-center"
                      style={{ backgroundColor: skillColor + "33" }}
                    >
                      <CloseIcon size={8} color={skillColor} />
                    </Box>
                  </Pressable>
                </Badge>
              );
              return reduceMotion ? (
                <Box key={skill.id}>{skillChip}</Box>
              ) : (
                <EntranceAnimation key={skill.id} variant="scale" delay={idx * 40}>
                  {skillChip}
                </EntranceAnimation>
              );
            })}
            {pendingCodeRefs.map((ref, index) => {
              const key = `${ref.path}-${ref.startLine}-${index}`;
              const range =
                ref.startLine === ref.endLine ? String(ref.startLine) : `${ref.startLine}-${ref.endLine}`;
              const label = `${getFileName(ref.path)} (${range})`;
              const badge = (
                <Badge action="info" variant="solid" size="md" className="pr-1">
                  <BadgeText>{label}</BadgeText>
                  {onRemoveCodeRef && (
                    <Pressable
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => {
                        triggerHaptic("selection");
                        onRemoveCodeRef(index);
                      }}
                      className="min-w-11 min-h-11 items-center justify-center ml-1"
                      accessibilityLabel="Remove code reference"
                    >
                      <Box
                        className="w-6 h-6 rounded-full items-center justify-center bg-primary-500/20"
                      >
                        <CloseIcon size={12} color={theme.colors.textPrimary} />
                      </Box>
                    </Pressable>
                  )}
                </Badge>
              );
              return reduceMotion ? (
                <Box key={key}>{badge}</Box>
              ) : (
                <EntranceAnimation key={key} variant="scale" delay={index * 50}>
                  {badge}
                </EntranceAnimation>
              );
            })}
          </HStack>
        )}
        <HStack space="md" className="flex-row items-start gap-3 min-h-11">
          <Textarea
            size="md"
            isDisabled={disabled}
            className="flex-1 min-h-10 h-auto min-w-0 w-full border-0"
            style={{
              backgroundColor: "transparent",
              borderWidth: 0,
              minHeight: DEFAULT_INPUT_HEIGHT + INPUT_VERTICAL_PADDING,
              height: inputHeight + INPUT_VERTICAL_PADDING,
              maxHeight: MAX_INPUT_HEIGHT + INPUT_VERTICAL_PADDING,
            }}
          >
            <TextareaInput
              placeholder={placeholder}
              value={prompt}
              onChangeText={setPrompt}
              editable={!disabled}
              multiline
              scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
              className={cn(
                "w-full min-w-0 text-base py-0 mt-0 mb-0 min-h-6 flex-none",
                Platform.OS === "android" && "py-0 my-0 align-top"
              )}
              style={{
                color: inputTextColor,
                maxHeight: MAX_INPUT_HEIGHT,
                minHeight: DEFAULT_INPUT_HEIGHT,
                width: "100%",
                minWidth: 0,
                overflow: "hidden",
                paddingTop: 8,
                paddingBottom: 8,
                lineHeight: LINE_HEIGHT,
              }}
              onContentSizeChange={handleContentSizeChange}
              maxLength={8000}
              blurOnSubmit={false}
              onSubmitEditing={handleSubmit}
              returnKeyType="default"
              autoCapitalize="sentences"
              autoCorrect
              autoComplete="off"
              textAlignVertical="top"
              placeholderTextColor={placeholderColor}
            />
          </Textarea>
          <Box
            className={cn(
              "w-2 h-2 rounded-full self-center",
              connected ? "bg-success-500 opacity-100" : "bg-background-400 opacity-50"
            )}
          />
        </HStack>

        <HStack className="w-full flex-row items-center justify-between mt-1">
          <HStack space="sm" className="flex-row items-center gap-2">
            <SkillHubPopover
              isDark={isDark}
              theme={theme}
              skillMenuVisible={skillMenuVisible}
              setSkillMenuVisible={setSkillMenuVisible}
              fetchEnabledSkills={fetchEnabledSkills}
              enabledSkills={enabledSkills}
              skillsLoading={skillsLoading}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              categories={categories}
              selectedSkills={selectedSkills}
              setSelectedSkills={setSelectedSkills}
              onOpenSkillsConfig={onOpenSkillsConfig || (() => { })}
            />
            <ScaleWrapper className="flex-shrink-1">
              <Pressable
                onPress={() => {
                  triggerHaptic("selection");
                  onOpenModelPicker?.();
                }}
                disabled={!onOpenModelPicker}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Select model"
                className="flex-row items-center gap-1.5 px-3 rounded-full h-11 min-w-11 max-w-40 justify-center active:opacity-90"
                style={{
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : theme.colors.surfaceMuted,
                  borderColor: isDark ? theme.colors.info : theme.colors.border,
                  borderWidth: isDark ? 1.5 : 1,
                }}
              >
                {currentModelLabel ? (
                  <Text
                    size="sm"
                    bold
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    className="flex-shrink"
                    style={{ color: isDark ? theme.colors.info : theme.colors.textPrimary }}
                  >
                    {currentModelLabel}
                  </Text>
                ) : null}
                <Box className="shrink-0 flex-row items-center justify-center">
                  <ChevronDownIcon size={14} color={isDark ? theme.colors.info : theme.colors.textPrimary} />
                </Box>
              </Pressable>
            </ScaleWrapper>
            {(onOpenProcesses || onOpenDocker || onOpenWebPreview) && (
              <SystemMenuPopover
                isDark={isDark}
                theme={theme}
                terminalMenuVisible={terminalMenuVisible}
                setTerminalMenuVisible={setTerminalMenuVisible}
                onOpenProcesses={onOpenProcesses}
                onOpenDocker={onOpenDocker}
                onOpenWebPreview={onOpenWebPreview}
              />
            )}
            {onTerminateAgent && sessionRunning && (
              <ActionIconButton
                icon={StopCircleIcon}
                onPress={() => {
                  triggerHaptic("heavy");
                  onTerminateAgent();
                }}
                accessibilityLabel="Terminate agent response"
                className="w-11 h-11 rounded-full px-0"
                tone="danger"
              />
            )}
          </HStack>
          {disabled ? (
            <Box className="w-11 h-11 rounded-full items-center justify-center">
              <ActivityIndicator size="small" color={theme.colors.info} />
            </Box>
          ) : (
            <Reanimated.View style={sendStyle}>
              <Button
                action="primary"
                variant="solid"
                size="md"
                onPress={handleSubmit}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                isDisabled={disabled}
                accessibilityLabel="Send message"
                className="w-11 h-11 rounded-full items-center justify-center active:opacity-80 p-0 m-0"
                style={{
                  backgroundColor: theme.colors.info,
                  borderColor: "transparent",
                  borderWidth: 0,
                  ...Platform.select({
                    ios: {
                      shadowColor: theme.colors.info,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.4,
                      shadowRadius: 8,
                    },
                    android: { elevation: 8 },
                    default: {},
                  }),
                }}
              >
                <ButtonIcon
                  as={
                    (p: { size?: number }) => {
                      const Icon = provider === "claude" ? ClaudeSendIcon : provider === "gemini" ? GeminiSendIcon : CodexEnterIcon;
                      return <Icon {...p} stroke="#FFFFFF" color="#FFFFFF" />;
                    }
                  }
                  size="md"
                  color="#FFFFFF"
                  style={{ color: "#FFFFFF" }}
                />
              </Button>
            </Reanimated.View>
          )}
        </HStack>
      </VStack>
    </Box >
  );
}
