import { AttachPlusIcon, ChevronDownIcon, ChevronUpIcon, DockerIcon, GlobeIcon, PortForwardIcon, TerminalIcon } from "@/components/icons/ChatActionIcons";
import { Popover, PopoverBackdrop, PopoverContent } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { ScaleWrapper } from "@/components/reusable/ScaleWrapper";
import { triggerHaptic } from "@/designSystem";
import { BlurView } from "expo-blur";
import React from "react";
import { View as RNView } from "react-native";

interface SystemMenuPopoverProps {
    isDark: boolean;
    theme: any;
    terminalMenuVisible: boolean;
    setTerminalMenuVisible: (visible: boolean) => void;
    onOpenProcesses?: () => void;
    onOpenDocker?: () => void;
    onOpenWebPreview?: () => void;
    isCloudflareMode?: boolean;
    onOpenPortForwarding?: () => void;
}

export function SystemMenuPopover({
    isDark,
    theme,
    terminalMenuVisible,
    setTerminalMenuVisible,
    onOpenProcesses,
    onOpenDocker,
    onOpenWebPreview,
    isCloudflareMode,
    onOpenPortForwarding,
}: SystemMenuPopoverProps) {
    return (
        <Popover
            isOpen={terminalMenuVisible}
            onClose={() => setTerminalMenuVisible(false)}
            onOpen={() => setTerminalMenuVisible(true)}
            placement="top right"
            offset={10}
            trigger={(triggerProps) => (
                <ScaleWrapper>
                    <Pressable
                        {...triggerProps}
                        onPress={(e) => {
                            triggerHaptic("selection");
                            setTerminalMenuVisible(!terminalMenuVisible);
                            if (triggerProps.onPress) { triggerProps.onPress(e); }
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
                </ScaleWrapper>
            )}
        >
            <PopoverBackdrop />
            <PopoverContent
                style={{
                    backgroundColor: isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.95)",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
                    borderWidth: 1,
                    borderRadius: 24,
                    padding: 8,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 12 },
                    shadowOpacity: isDark ? 0.5 : 0.15,
                    shadowRadius: 32,
                    elevation: 10,
                    overflow: "hidden",
                    width: "auto"
                }}
            >
                <BlurView
                    intensity={isDark ? 40 : 60}
                    tint={isDark ? "dark" : "light"}
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
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
                                    width: 64,
                                    height: 64,
                                    gap: 4,
                                    borderRadius: 16,
                                    backgroundColor: pressed ? (isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)") : "transparent",
                                }
                            ]}
                        >
                            <TerminalIcon size={24} color={isDark ? "#FF00FF" : theme.colors.info} />
                            <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "600", fontSize: 10 }}>Process</Text>
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
                                    width: 64,
                                    height: 64,
                                    gap: 4,
                                    borderRadius: 16,
                                    backgroundColor: pressed ? (isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)") : "transparent",
                                }
                            ]}
                        >
                            <DockerIcon size={24} color={theme.colors.accent} />
                            <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "600", fontSize: 10 }}>Docker</Text>
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
                                    width: 64,
                                    height: 64,
                                    gap: 4,
                                    borderRadius: 16,
                                    backgroundColor: pressed ? (isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)") : "transparent",
                                }
                            ]}
                        >
                            <GlobeIcon size={24} color={theme.colors.info} />
                            <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "600", fontSize: 10 }}>Browser</Text>
                        </Pressable>
                    )}
                    {isCloudflareMode && onOpenPortForwarding && (
                        <Pressable
                            onPress={() => {
                                triggerHaptic("selection");
                                setTerminalMenuVisible(false);
                                onOpenPortForwarding();
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Port Forwarding"
                            style={({ pressed }) => [
                                {
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 64,
                                    height: 64,
                                    gap: 4,
                                    borderRadius: 16,
                                    backgroundColor: pressed ? (isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)") : "transparent",
                                }
                            ]}
                        >
                            <PortForwardIcon size={24} color={theme.colors.success} />
                            <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "600", fontSize: 10 }}>Ports</Text>
                        </Pressable>
                    )}
                </BlurView>
            </PopoverContent>
        </Popover>
    );
}
