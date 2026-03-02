import { Box } from "@/components/ui/box";
import { useTheme } from "@/theme/index";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import Svg, { Polygon } from "react-native-svg";

interface PremiumInputContainerProps {
    width: number;
    height: number;
    children?: React.ReactNode;
}

export function PremiumInputContainer({ width, height, children }: PremiumInputContainerProps) {
    const theme = useTheme();
    const isDark = theme.mode === "dark";
    const cut = 24;

    // Define points for the cut-corner polygon
    // Top-left: (0, cut), (cut, 0)
    // Top-right: (width, 0)
    // Bottom-right: (width, height - cut), (width - cut, height)
    // Bottom-left: (0, height)
    const points = `0,${cut} ${cut},0 ${width},0 ${width},${height - cut} ${width - cut},${height} 0,${height}`;

    if (!isDark) {
        return (
            <Box style={{
                width,
                height,
                position: "absolute",
                top: 0,
                left: 0,
                backgroundColor: theme.colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                borderRadius: 24, // Fallback rounding if Svg not used
                shadowColor: theme.colors.shadow,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 1,
                shadowRadius: 16,
                elevation: 4,
                overflow: "hidden"
            }}>
                <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
                {/* We use Svg even in light mode for the exact cut corner shape if desired, 
            but standard rounded corners with BlurView often look cleaner in light mode.
            Let's stick to consistent cut corner for 'Premium' look. */}
                <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
                    <Polygon points={points} fill={theme.colors.surface} stroke={theme.colors.border} strokeWidth={1} />
                </Svg>
            </Box>
        );
    }

    return (
        <Box style={{ width, height, position: "absolute", top: 0, left: 0 }}>
            <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
            <Svg width={width} height={height}>
                {/* Outer glow/border */}
                <Polygon
                    points={points}
                    fill="none"
                    stroke={theme.colors.accent}
                    strokeWidth={4}
                    opacity={0.2}
                />
                {/* Main border */}
                <Polygon
                    points={points}
                    fill={theme.colors.surface}
                    stroke={theme.colors.accent}
                    strokeWidth={1.5}
                />
            </Svg>
        </Box>
    );
}
