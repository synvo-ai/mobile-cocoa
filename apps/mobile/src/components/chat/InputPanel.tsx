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
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Button, ButtonIcon } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import { VStack } from "@/components/ui/vstack";
import { Popover, PopoverBackdrop, PopoverContent } from "@/components/ui/popover";
import { Menu, MenuItem, MenuItemLabel } from "@/components/ui/menu";
import { type Provider } from "@/constants/modelOptions";
import { EntranceAnimation, triggerHaptic } from "@/design-system";
import { useTheme } from "@/theme/index";
import { cn } from "@/utils/cn";
import { getFileName } from "@/utils/path";
import { CATEGORY_COLORS, CATEGORY_COLORS_LIGHT, type Category } from "@/utils/skillColors";
import { BlurView } from "expo-blur";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Dimensions, Keyboard, Modal, Platform, ScrollView, StyleSheet, TouchableWithoutFeedback, View as RNView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Polygon } from "react-native-svg";

function InputWrapper({ width, height, isDark, theme }: { width: number; height: number; isDark: boolean; theme: any }) {
  const cut = 24;
  const points = `0,${cut} ${cut},0 ${width},0 ${width},${height - cut} ${width - cut},${height} 0,${height}`;

  if (!isDark) {
    return (
      <Box style={{
        width,
        height,
        position: "absolute",
        top: 0,
        left: 0,
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
        overflow: "hidden"
      }}>
        <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
      </Box>
    );
  }

  const color = theme.colors.success; // CTA border using theme token
  const accentColor = theme.colors.info; // Accent stroke using theme token
  const bg = "rgba(15, 23, 42, 0.85)"; // Dark background

  return (
    <Box style={{ width, height, position: "absolute", top: 0, left: 0 }}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <Svg width={width} height={height}>
        <Polygon points={points} fill="none" stroke={color} strokeWidth={6} opacity={0.3} />
        <Polygon points={points} fill="none" stroke={accentColor} strokeWidth={3} opacity={0.6} />
        <Polygon points={points} fill={bg} stroke={color} strokeWidth={1.5} />
      </Svg>
    </Box>
  );
}

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
  onPermissionModeChange: (mode: string) => void;
  onSubmit: (prompt: string, permissionMode?: string) => void;
  pendingCodeRefs?: PendingCodeRef[];
  onRemoveCodeRef?: (index: number) => void;
  onTerminateAgent?: () => void;
  onOpenWebPreview?: () => void;
  onOpenProcesses?: () => void;
  provider?: Provider;
  model?: string;
  modelOptions?: { value: string; label: string }[];
  providerModelOptions?: Record<Provider, { value: string; label: string }[]>;
  onProviderChange?: (provider: Provider) => void;
  onModelChange?: (model: string) => void;
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
  onPermissionModeChange,
  onSubmit,
  pendingCodeRefs = [],
  onRemoveCodeRef,
  onTerminateAgent,
  onOpenWebPreview,
  onOpenProcesses,
  provider = "codex",
  model = "gpt-5.1-codex-mini",
  modelOptions = [],
  providerModelOptions,
  onProviderChange,
  onModelChange,
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
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<{ id: string; name: string; category?: string }[]>([]);

  const categories = useMemo(() => {
    return Array.from(new Set(enabledSkills.map(s => s.category || "Uncategorized"))).sort();
  }, [enabledSkills]);

  useEffect(() => {
    if (categories.length > 0 && (!selectedCategory || !categories.includes(selectedCategory))) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);
  const [inputHeight, setInputHeight] = useState(DEFAULT_INPUT_HEIGHT);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const { bottom } = useSafeAreaInsets();
  const triggerLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const skillTriggerLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const [skillCategoryHeights, setSkillCategoryHeights] = useState<Record<string, number>>({});
  const maxSkillCategoryHeight = useMemo(() => {
    const heights = Object.values(skillCategoryHeights);
    if (heights.length === 0) return 180; // Default height while measuring
    return Math.max(...heights);
  }, [skillCategoryHeights]);

  const fetchEnabledSkills = useCallback(() => {
    if (!serverBaseUrl) return;
    setSkillsLoading(true);
    Promise.all([
      fetch(`${serverBaseUrl}/api/skills`).then(r => r.json()),
      fetch(`${serverBaseUrl}/api/skills-enabled`).then(r => r.json())
    ]).then(([allData, enabledData]) => {
      const enabledSet = new Set(enabledData?.enabledIds || []);
      const allSkills = allData?.skills || [];
      setEnabledSkills(allSkills.filter((s: any) => enabledSet.has(s.id)));
    }).catch((err) => { console.error('[SkillHub] Failed to fetch skills:', err); }).finally(() => setSkillsLoading(false));
  }, [serverBaseUrl]);

  const sendScale = useRef(new Animated.Value(1)).current;
  const sendStyle = { transform: [{ scale: sendScale }] };

  const handlePressIn = useCallback(() => {
    Animated.spring(sendScale, { toValue: 0.92, useNativeDriver: true }).start();
  }, [sendScale]);
  const handlePressOut = useCallback(() => {
    Animated.spring(sendScale, { toValue: 1, useNativeDriver: true }).start();
  }, [sendScale]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  const currentModelLabel =
    modelOptions.find((m) => m.value === model)?.label ??
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
      ? selectedSkills.map(s => `<skill>Use ${s.name}</skill>`).join(" ") + " "
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
        className="flex-col gap-3 py-3 px-4 mt-6"
        onLayout={(e) => setPanelSize(e.nativeEvent.layout)}
        style={{ backgroundColor: "transparent" }}
      >
        {panelSize.width > 0 && panelSize.height > 0 && (
          <InputWrapper width={panelSize.width} height={panelSize.height} isDark={isDark} theme={theme} />
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
            className="flex-1 min-h-10 h-auto min-w-0 w-full"
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
              showsVerticalScrollIndicator={false}
              style={{
                color: inputTextColor,
                maxHeight: MAX_INPUT_HEIGHT,
                minHeight: DEFAULT_INPUT_HEIGHT,
                width: "100%",
                minWidth: 0,
                overflow: "hidden",
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
              className={cn(
                "w-full min-w-0 text-base py-2 min-h-6 flex-none",
                Platform.OS === "android" && "text-start"
              )}
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
        <HStack space="sm" className="w-full flex-row items-center justify-between gap-2 flex-nowrap mt-1">
          {onOpenSkillsConfig && (
            <>
              <Popover
                isOpen={skillMenuVisible}
                onClose={() => setSkillMenuVisible(false)}
                onOpen={() => setSkillMenuVisible(true)}
                trigger={(triggerProps) => (
                  <Pressable
                    {...triggerProps}
                    onPress={(e) => {
                      triggerHaptic("selection");
                      fetchEnabledSkills();
                      setSkillMenuVisible(!skillMenuVisible);
                      if (triggerProps.onPress) { triggerProps.onPress(e); }
                    }}
                    onLayout={(e) => {
                      e.target.measureInWindow((x: number, y: number, w: number, h: number) => {
                        skillTriggerLayout.current = { x, y, width: w, height: h };
                      });
                    }}
                    accessibilityLabel="Skill Hub"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    className="items-center justify-center p-2 rounded-full w-11 h-11 active:opacity-90"
                    style={{
                      backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : theme.colors.surfaceMuted,
                      borderColor: isDark ? theme.colors.accent : theme.colors.border,
                      borderWidth: isDark ? 1.5 : 1,
                    }}
                  >
                    <SkillIcon size={20} />
                  </Pressable>
                )}
                placement="top left"
              >
                <PopoverBackdrop />
                <PopoverContent
                  style={{
                    backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
                    borderWidth: 1,
                    borderRadius: 20,
                    padding: 12,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 12 },
                    shadowOpacity: isDark ? 0.5 : 0.15,
                    shadowRadius: 32,
                    elevation: 10,
                    width: Dimensions.get("window").width * 0.60,
                    overflow: "hidden"
                  }}
                >
                  {/* Placeholder for measurer if required, but Popover expands generally, so removed. */}

                  <HStack className="items-center justify-between mb-4 px-2">
                    <Text style={{
                      color: isDark ? theme.colors.accent : theme.colors.textPrimary,
                      fontWeight: "800",
                      fontSize: 18,
                      letterSpacing: -0.5
                    }}>Skill Hub</Text>
                    <Pressable
                      onPress={() => {
                        triggerHaptic("selection");
                        setSkillMenuVisible(false);
                        onOpenSkillsConfig();
                      }}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={({ pressed }) => [
                        {
                          padding: 6,
                          borderRadius: 12,
                          backgroundColor: isDark
                            ? (pressed ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)")
                            : (pressed ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.04)"),
                          opacity: pressed ? 0.7 : 1,
                        }
                      ]}
                    >
                      <AttachPlusIcon size={18} color={isDark ? theme.colors.accent : theme.colors.textPrimary} strokeWidth={2.5} />
                    </Pressable>
                  </HStack>

                  {skillsLoading ? (
                    <Text style={{ padding: 8, color: theme.colors.textMuted }}>Loading...</Text>
                  ) : enabledSkills.length === 0 ? (
                    <Text style={{ padding: 8, color: theme.colors.textMuted }}>No skills enabled.</Text>
                  ) : (
                    <>
                      <RNView style={{ marginBottom: 12, paddingHorizontal: 4, zIndex: 10, position: "relative" }}>
                        <Menu
                          placement="bottom"
                          offset={5}
                          style={{
                            backgroundColor: isDark ? theme.colors.surfaceAlt : "#ffffff",
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.15,
                            shadowRadius: 12,
                            elevation: 15,
                            padding: 6,
                          }}
                          trigger={(triggerProps) => (
                            <Pressable
                              {...triggerProps}
                              onPress={(e) => {
                                triggerHaptic("selection");
                                if (triggerProps.onPress) { triggerProps.onPress(e); }
                              }}
                              style={({ pressed }) => [{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingHorizontal: 16,
                                paddingVertical: 10,
                                borderRadius: 16,
                                backgroundColor: isDark
                                  ? (pressed ? "rgba(255, 255, 255, 0.15)" : theme.colors.surfaceAlt)
                                  : (pressed ? "rgba(0,0,0,0.06)" : "#ffffff"),
                                borderWidth: 1.5,
                                borderColor: isDark ? theme.colors.accent : theme.colors.info,
                                shadowColor: isDark ? theme.colors.accent : theme.colors.info,
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.2,
                                shadowRadius: 8,
                                elevation: 4,
                              }]}
                            >
                              <HStack style={{ alignItems: "center", gap: 6 }}>
                                {getCategoryIcon(selectedCategory, { color: isDark ? theme.colors.accent : theme.colors.info, size: 14, strokeWidth: 2.5 })}
                                <Text style={{
                                  color: isDark ? theme.colors.accent : theme.colors.info,
                                  fontWeight: "600",
                                  fontSize: 13,
                                }}>
                                  {selectedCategory}
                                </Text>
                              </HStack>
                              <ChevronDownIcon size={14} color={isDark ? theme.colors.accent : theme.colors.info} />
                            </Pressable>
                          )}
                        >
                          {categories.map((category, idx) => (
                            <MenuItem
                              key={category}
                              textValue={category}
                              onPress={() => {
                                triggerHaptic("selection");
                                setSelectedCategory(category);
                              }}
                              style={({ pressed }) => [{
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderRadius: 12,
                                marginTop: idx > 0 ? 4 : 0,
                                backgroundColor: selectedCategory === category
                                  ? (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)")
                                  : (pressed ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)") : "transparent"),
                              }]}
                            >
                              <HStack style={{ alignItems: "center", gap: 6 }}>
                                {getCategoryIcon(category, {
                                  color: selectedCategory === category
                                    ? (isDark ? theme.colors.accent : theme.colors.textPrimary)
                                    : (isDark ? theme.colors.textMuted : theme.colors.textSecondary),
                                  size: 14,
                                  strokeWidth: selectedCategory === category ? 2.5 : 2
                                })}
                                <Text style={{
                                  color: selectedCategory === category
                                    ? (isDark ? theme.colors.accent : theme.colors.textPrimary)
                                    : (isDark ? theme.colors.textMuted : theme.colors.textSecondary),
                                  fontWeight: selectedCategory === category ? "700" : "500",
                                  fontSize: 13,
                                }}>
                                  {category}
                                </Text>
                              </HStack>
                            </MenuItem>
                          ))}
                        </Menu>
                      </RNView>
                      <ScrollView
                        style={{
                          height: Math.min(maxSkillCategoryHeight, Dimensions.get("window").height * 0.55),
                          maxHeight: Dimensions.get("window").height * 0.6
                        }}
                        showsVerticalScrollIndicator={false}
                      >
                        <RNView style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 16 }}>
                          {enabledSkills
                            .filter(skill => (skill.category || "Uncategorized") === selectedCategory)
                            .map(skill => {
                              const isSelected = selectedSkills.some(s => s.id === skill.id);
                              const skillCategory = (skill.category as Category) ?? "Development";
                              const palette = isDark ? CATEGORY_COLORS : CATEGORY_COLORS_LIGHT;
                              const skillColor = palette[skillCategory]?.text ?? (isDark ? "#38BDF8" : "#0EA5E9");
                              const skillBg = palette[skillCategory]?.active ?? (isDark ? "rgba(56, 189, 248, 0.15)" : "rgba(14, 165, 233, 0.10)");

                              return (
                                <Pressable
                                  key={skill.id}
                                  onPress={() => {
                                    triggerHaptic("selection");
                                    setSelectedSkills(prev => {
                                      if (prev.some(s => s.id === skill.id)) {
                                        return prev.filter(s => s.id !== skill.id);
                                      }
                                      return [...prev, { id: skill.id, name: skill.name, category: skill.category }];
                                    });
                                    // Optional: setSkillMenuVisible(false) could be removed if we want to let users select multiple at once, but let's keep the existing behaviour for now
                                    setSkillMenuVisible(false);
                                  }}
                                  style={({ pressed }) => [
                                    {
                                      flexDirection: "row",
                                      alignItems: "center",
                                      paddingVertical: 6,
                                      paddingHorizontal: 10,
                                      borderRadius: 14,
                                      gap: 6,
                                      backgroundColor: isSelected
                                        ? skillBg
                                        : isDark
                                          ? (pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)")
                                          : (pressed ? "rgba(0,0,0,0.05)" : "rgba(0,0,0,0.02)"),
                                      borderWidth: 1,
                                      borderColor: isSelected
                                        ? skillColor + "80"
                                        : isDark
                                          ? (pressed ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)")
                                          : (pressed ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.05)"),
                                    }
                                  ]}
                                >
                                  <VibeIcon size={14} />
                                  <Text style={{
                                    color: isSelected
                                      ? skillColor
                                      : theme.colors.textPrimary,
                                    fontWeight: isSelected ? "700" : "500",
                                    fontSize: 12
                                  }}>
                                    {skill.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                        </RNView>
                      </ScrollView>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </>
          )}
          <Pressable
            onPress={() => {
              triggerHaptic("selection");
              onOpenModelPicker?.();
            }}
            disabled={!onOpenModelPicker}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Select model"
            className="flex-1 flex-row items-center gap-0.5 py-0.5 px-2 rounded-full min-h-11 min-w-0 max-w-36 justify-start active:opacity-90"
            style={{
              backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : theme.colors.surfaceMuted,
              borderColor: isDark ? theme.colors.info : theme.colors.border,
              borderWidth: isDark ? 1.5 : 1,
            }}
          >
            <Text
              size="sm"
              bold
              numberOfLines={2}
              ellipsizeMode="tail"
              className="flex-1 min-w-0"
              style={{ color: isDark ? theme.colors.info : theme.colors.textPrimary }}
            >
              {currentModelLabel}
            </Text>
            <Box className="shrink-0 self-center pl-1">
              <ChevronDownIcon size={12} color={isDark ? theme.colors.info : theme.colors.textPrimary} />
            </Box>
          </Pressable>
          {(onOpenProcesses || onOpenDocker || onOpenWebPreview) && (
            <>
              <Pressable
                onPress={() => {
                  triggerHaptic("selection");
                  setTerminalMenuVisible((v) => !v);
                }}
                onLayout={(e) => {
                  e.target.measureInWindow((x: number, y: number, w: number, h: number) => {
                    triggerLayout.current = { x, y, width: w, height: h };
                  });
                }}
                accessibilityLabel="System menu"
                className="flex-row items-center justify-center gap-1 px-3 rounded-full min-h-11 active:opacity-80"
                style={isDark ? {
                  backgroundColor: "rgba(255, 0, 255, 0.1)",
                  borderColor: "#FF00FF",
                  borderWidth: 1.5
                } : {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                  borderWidth: 1
                }}
              >
                <AttachPlusIcon size={20} color={isDark ? "#FF00FF" : theme.colors.textPrimary} />
                {terminalMenuVisible ? (
                  <ChevronUpIcon size={12} color={isDark ? "#FF00FF" : theme.colors.textPrimary} />
                ) : (
                  <ChevronDownIcon size={12} color={isDark ? "#FF00FF" : theme.colors.textPrimary} />
                )}
              </Pressable>
              <Modal
                visible={terminalMenuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setTerminalMenuVisible(false)}
              >
                <TouchableWithoutFeedback onPress={() => setTerminalMenuVisible(false)}>
                  <RNView style={StyleSheet.absoluteFill}>
                    <BlurView
                      intensity={isDark ? 40 : 60}
                      tint={isDark ? "dark" : "light"}
                      style={{
                        position: "absolute",
                        bottom: triggerLayout.current
                          ? (Dimensions.get("window").height - triggerLayout.current.y + 8)
                          : 100,
                        right: 16,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        backgroundColor: isDark ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.9)",
                        borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
                        borderWidth: 1,
                        borderRadius: 24,
                        padding: 8,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 12 },
                        shadowOpacity: isDark ? 0.5 : 0.15,
                        shadowRadius: 32,
                        elevation: 10,
                        overflow: "hidden"
                      }}
                    >
                      {onOpenProcesses && (
                        <Pressable
                          onPress={() => {
                            triggerHaptic("selection");
                            setTerminalMenuVisible(false);
                            onOpenProcesses();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Open Terminal"
                          style={({ pressed }) => [
                            {
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 56,
                              height: 56,
                              gap: 4,
                              borderRadius: 16,
                              backgroundColor: pressed ? (isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)") : "transparent",
                            }
                          ]}
                        >
                          <TerminalIcon size={22} color={isDark ? "#FF00FF" : theme.colors.info} />
                          <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "500", fontSize: 10 }}>Process</Text>
                        </Pressable>
                      )}
                      {onOpenDocker && (
                        <Pressable
                          onPress={() => {
                            triggerHaptic("selection");
                            setTerminalMenuVisible(false);
                            onOpenDocker();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Open Docker"
                          style={({ pressed }) => [
                            {
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 56,
                              height: 56,
                              gap: 4,
                              borderRadius: 16,
                              backgroundColor: pressed ? (isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)") : "transparent",
                            }
                          ]}
                        >
                          <DockerIcon size={22} color={theme.colors.accent} />
                          <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "500", fontSize: 10 }}>Docker</Text>
                        </Pressable>
                      )}
                      {onOpenWebPreview && (
                        <Pressable
                          onPress={() => {
                            triggerHaptic("selection");
                            setTerminalMenuVisible(false);
                            onOpenWebPreview();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Open Browser"
                          style={({ pressed }) => [
                            {
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 56,
                              height: 56,
                              gap: 4,
                              borderRadius: 16,
                              backgroundColor: pressed ? (isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)") : "transparent",
                            }
                          ]}
                        >
                          <GlobeIcon size={22} color={theme.colors.info} />
                          <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "500", fontSize: 10 }}>Browser</Text>
                        </Pressable>
                      )}
                    </BlurView>
                  </RNView>
                </TouchableWithoutFeedback>
              </Modal>
            </>
          )}
          {onTerminateAgent && sessionRunning && (
            <ActionIconButton
              icon={StopCircleIcon}
              onPress={() => {
                triggerHaptic("heavy");
                onTerminateAgent();
              }}
              accessibilityLabel="Terminate agent response"
              className="w-11 h-11 rounded-xl"
              tone="danger"
            />
          )}
          {!(sessionRunning && !waitingForUserInput) && (
            <Animated.View style={sendStyle}>
              <Button
                action="primary"
                variant="solid"
                size="md"
                onPress={handleSubmit}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                isDisabled={disabled}
                accessibilityLabel="Send message"
                className="w-12 h-12 rounded-full active:opacity-80"
                style={
                  disabled
                    ? undefined
                    : {
                      backgroundColor: isDark ? theme.colors.accentSoft : theme.colors.textPrimary,
                      borderColor: isDark ? theme.colors.accent : "transparent",
                      borderWidth: isDark ? 1.5 : 0,
                      ...Platform.select({
                        ios: {
                          shadowColor: isDark ? theme.colors.accent : theme.colors.textPrimary,
                          shadowOffset: isDark ? { width: 0, height: 0 } : { width: 0, height: 4 },
                          shadowOpacity: isDark ? 0.5 : 0.3,
                          shadowRadius: isDark ? 8 : 8,
                        },
                        android: { elevation: 8 },
                        default: {},
                      }),
                    }
                }
              >
                <ButtonIcon
                  as={
                    (p: { size?: number }) => {
                      const Icon = provider === "claude" ? ClaudeSendIcon : provider === "gemini" ? GeminiSendIcon : CodexEnterIcon;
                      return <Icon {...p} stroke={isDark ? theme.colors.accent : theme.colors.textInverse} color={isDark ? theme.colors.accent : theme.colors.textInverse} />;
                    }
                  }
                  size="md"
                  color={isDark ? theme.colors.accent : theme.colors.textInverse}
                  style={{ color: isDark ? theme.colors.accent : theme.colors.textInverse }}
                />
              </Button>
            </Animated.View>
          )}
        </HStack>
      </VStack>
    </Box >
  );
}
