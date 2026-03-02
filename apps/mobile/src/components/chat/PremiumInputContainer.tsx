import { Box } from "@/components/ui/box";
import { useTheme } from "@/theme/index";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet } from "react-native";

interface PremiumInputContainerProps {
    width: number;
    height: number;
    children?: React.ReactNode;
}

export function PremiumInputContainer({ width, height, children }: PremiumInputContainerProps) {
    const theme = useTheme();
    const isDark = theme.mode === "dark";

    return (
        <Box style={{
            width,
            height,
            position: "absolute",
            top: 0,
            left: 0,
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.6)" : theme.colors.surface,
            borderWidth: isDark ? 1.5 : StyleSheet.hairlineWidth,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.colors.border,
            borderRadius: 24,
            overflow: "hidden",
            shadowColor: theme.colors.shadow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.3 : 0.08,
            shadowRadius: 16,
            elevation: 4,
        }}>
            <BlurView intensity={isDark ? 30 : 60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            {children}
        </Box>
    );
}
