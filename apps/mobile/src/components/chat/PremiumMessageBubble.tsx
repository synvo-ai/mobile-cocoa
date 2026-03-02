import { Box } from "@/components/ui/box";
import { useTheme } from "@/theme/index";
import { BlurView } from "expo-blur";
import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Polygon } from "react-native-svg";

interface PremiumMessageBubbleProps {
    isUser: boolean;
    width: number;
    height: number;
    children?: React.ReactNode;
}

export function PremiumMessageBubble({ isUser, width, height, children }: PremiumMessageBubbleProps) {
    const theme = useTheme();
    const isDark = theme.mode === "dark";

    if (isUser) {
        return (
            <Box style={{
                width,
                height,
                position: "absolute",
                top: 0,
                left: 0,
                backgroundColor: isDark ? theme.colors.surfaceMuted : "rgba(37, 99, 235, 0.9)", // Vibrant blue for user in light mode
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 6,
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? theme.colors.borderSubtle : "transparent",
                shadowColor: theme.colors.shadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.3 : 0.1,
                shadowRadius: 10,
                elevation: 2,
            }} />
        );
    }

    // Assistant Bubble Refinement
    if (!isDark) {
        return (
            <Box style={{
                width,
                height,
                position: "absolute",
                top: 0,
                left: 0,
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 24,
                borderWidth: 1,
                borderColor: theme.colors.border,
                shadowColor: theme.colors.shadow,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                overflow: "hidden"
            }}>
                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
            </Box>
        );
    }

    // Dark mode assistant: Premium Cut Corner with accent border
    const cut = 16;
    const points = `0,0 ${width - cut},0 ${width},${cut} ${width},${height} ${cut},${height} 0,${height - cut}`;

    return (
        <Box style={{ width, height, position: "absolute", top: 0, left: 0 }}>
            {/* Subtle background blur for depth */}
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <Svg width={width} height={height}>
                <Polygon points={points} fill={theme.colors.surface} stroke={theme.colors.border} strokeWidth={1} />
                {/* Accent highlight at the cut corner */}
                <Polygon
                    points={`${width - cut},0 ${width},${cut} ${width},${cut + 12}`}
                    fill="none"
                    stroke={theme.colors.accent}
                    strokeWidth={1.5}
                    opacity={0.5}
                />
            </Svg>
        </Box>
    );
}
