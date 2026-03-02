import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/index";
import { triggerHaptic } from "@/designSystem";
import { BlurView } from "expo-blur";
import React from "react";
import { StyleSheet } from "react-native";
import Reanimated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import { CopyIcon, RefreshCwIcon, ShareIcon } from "@/components/icons/ChatActionIcons";

interface MessageActionToolbarProps {
    isVisible: boolean;
    isUser: boolean;
    onCopy: () => void;
    onRegenerate?: () => void;
    onShare?: () => void;
}

export function MessageActionToolbar({ isVisible, isUser, onCopy, onRegenerate, onShare }: MessageActionToolbarProps) {
    const theme = useTheme();
    const isDark = theme.mode === "dark";

    if (!isVisible) return null;

    return (
        <Reanimated.View
            entering={ZoomIn.duration(200)}
            exiting={ZoomOut.duration(150)}
            style={{
                position: "absolute",
                top: -46,
                [isUser ? "right" : "left"]: 0,
                zIndex: 1000,
            }}
        >
            <Box style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: isDark ? "rgba(30, 41, 59, 0.95)" : "rgba(255, 255, 255, 0.95)",
                borderRadius: 14,
                padding: 4,
                borderWidth: 1,
                borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 6,
                overflow: "hidden",
            }}>
                <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />

                <ToolbarButton
                    icon={<CopyIcon size={16} color={theme.colors.textPrimary} />}
                    label="Copy"
                    onPress={onCopy}
                    theme={theme}
                />

                {onRegenerate && !isUser && (
                    <ToolbarButton
                        icon={<RefreshCwIcon size={16} color={theme.colors.textPrimary} />}
                        label="Retry"
                        onPress={onRegenerate}
                        theme={theme}
                    />
                )}

                {onShare && (
                    <ToolbarButton
                        icon={<ShareIcon size={16} color={theme.colors.textPrimary} />}
                        label="Share"
                        onPress={onShare}
                        theme={theme}
                    />
                )}
            </Box>
        </Reanimated.View>
    );
}

function ToolbarButton({ icon, label, onPress, theme }: { icon: React.ReactNode, label: string, onPress: () => void, theme: any }) {
    return (
        <Pressable
            onPress={() => {
                triggerHaptic("selection");
                onPress();
            }}
            style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: pressed ? (theme.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)") : "transparent",
            })}
        >
            {icon}
            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.textPrimary }}>{label}</Text>
        </Pressable>
    );
}
