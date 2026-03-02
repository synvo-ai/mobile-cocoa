import { AttachPlusIcon, ChevronDownIcon, SkillIcon, VibeIcon } from "@/components/icons/ChatActionIcons";
import { getCategoryIcon } from "@/components/icons/SkillCategoryIcons";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Popover, PopoverBackdrop, PopoverContent } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { triggerHaptic } from "@/designSystem";
import { CATEGORY_COLORS, CATEGORY_COLORS_LIGHT, type Category } from "@/utils/skillColors";
import React from "react";
import { Dimensions, ScrollView, View as RNView } from "react-native";

interface SkillHubPopoverProps {
    isDark: boolean;
    theme: any;
    skillMenuVisible: boolean;
    setSkillMenuVisible: (visible: boolean) => void;
    fetchEnabledSkills: () => void;
    enabledSkills: { id: string; name: string; category?: string }[];
    skillsLoading: boolean;
    selectedCategory: string;
    setSelectedCategory: (category: string) => void;
    categories: string[];
    selectedSkills: { id: string; name: string; category?: string }[];
    setSelectedSkills: (update: (prev: { id: string; name: string; category?: string }[]) => { id: string; name: string; category?: string }[]) => void;
    onOpenSkillsConfig: () => void;
}

export function SkillHubPopover({
    isDark,
    theme,
    skillMenuVisible,
    setSkillMenuVisible,
    fetchEnabledSkills,
    enabledSkills,
    skillsLoading,
    selectedCategory,
    setSelectedCategory,
    categories,
    selectedSkills,
    setSelectedSkills,
    onOpenSkillsConfig,
}: SkillHubPopoverProps) {
    const maxSkillCategoryHeight = 180;

    return (
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
                        accessibilityLabel="Skill configuration"
                        accessibilityRole="button"
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
    );
}
